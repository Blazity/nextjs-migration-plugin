export function sanitizeComponentName(raw: string, fallbackIndex = 0): string {
  const ascii = raw.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const parts = ascii.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length === 0) return `Component${fallbackIndex}`;
  return parts.map((p) => p[0].toUpperCase() + p.slice(1)).join("");
}

export type ApprovedNameValidation =
  | { ok: true }
  | { ok: false; reason: "implementation name must be semantic PascalCase" };

export function validateApprovedName(name: string): ApprovedNameValidation {
  if (
    !/^[A-Z][A-Za-z0-9]*$/.test(name) ||
    /^(?:Component\d+|Section\d+)$/.test(name) ||
    /p\d+-s\d+/i.test(name) ||
    /^P\d+S\d+$/.test(name)
  ) {
    return {
      ok: false,
      reason: "implementation name must be semantic PascalCase",
    };
  }
  return { ok: true };
}

const NEXT_IMPORTS: Record<string, string> = {
  Image: 'import Image from "next/image";',
  Link: 'import Link from "next/link";',
  Script: 'import Script from "next/script";',
};

export function detectNextImports(body: string): string {
  const lines = Object.entries(NEXT_IMPORTS)
    .filter(([tag]) => new RegExp(`<${tag}\\b`).test(body))
    .map(([, line]) => line);
  return lines.length > 0 ? lines.join("\n") + "\n\n" : "";
}

export function escapeUnsafeLessThan(jsx: string): string {
  return jsx.replace(/<(?![a-zA-Z/!?])/g, "&lt;");
}

export function transformOrWrap(raw: string, name: string): string {
  if (/export\s+default\s+function\s+\w+/.test(raw)) {
    return raw.replace(
      /export\s+default\s+function\s+\w+/,
      `export default function ${name}`,
    );
  }
  const stripped = raw.replace(/^\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)+/g, "").trim();
  const escaped = escapeUnsafeLessThan(stripped);
  const imports = detectNextImports(escaped);
  return `${imports}export default function ${name}() {
  return (
    <>
${indentLines(escaped, 6)}
    </>
  );
}
`;
}

export function renderComponentModule(
  sources: Array<{
    raw: string;
    name: string;
    exportKind: "default" | "named";
  }>,
): string {
  const imports = new Set<string>();
  const functions: string[] = [];
  for (const source of sources) {
    const rendered = transformOrWrap(source.raw, source.name);
    const extracted = extractLeadingImports(rendered);
    for (const line of extracted.imports) imports.add(line);
    const body =
      source.exportKind === "default"
        ? extracted.body
        : extracted.body.replace("export default function", "export function");
    functions.push(body.trimEnd());
  }

  const importBlock = [...imports].join("\n");
  return `${importBlock}${importBlock ? "\n\n" : ""}${functions.join("\n\n")}\n`;
}

export function renderComponentStories(args: {
  implementationName: string;
  sectionInstanceIds: string[];
  /**
   * Map of `sectionInstanceId → exportName` produced by the deduper. When
   * absent, the renderer falls back to the legacy positional scheme
   * (`Implementation`, `ImplementationVariant2`, …) — useful for callers
   * that don't dedupe.
   */
  exportNameBySectionInstanceId?: Record<string, string>;
}): string {
  const componentImport = `${args.implementationName}Component`;

  // Decide the export each section maps to. With dedup info we use it;
  // otherwise mirror the old positional naming.
  const map = args.exportNameBySectionInstanceId;
  const exportForIndex = (index: number, sectionInstanceId: string): string => {
    if (map && map[sectionInstanceId]) return map[sectionInstanceId];
    return index === 0
      ? args.implementationName
      : `${args.implementationName}Variant${index + 1}`;
  };

  // Distinct named exports beyond the default. Preserve insertion order so
  // imports match the order exports appear in the component module.
  const seenExports = new Set<string>([args.implementationName]);
  const namedVariantExports: string[] = [];
  args.sectionInstanceIds.forEach((sectionInstanceId, index) => {
    const exportName = exportForIndex(index, sectionInstanceId);
    if (seenExports.has(exportName)) return;
    seenExports.add(exportName);
    namedVariantExports.push(exportName);
  });

  const namedImports =
    namedVariantExports.length > 0
      ? `, { ${namedVariantExports.map((name) => `${name} as ${name}Component`).join(", ")} }`
      : "";

  // Deduped stories: each distinct export gets exactly one story; the
  // story label is the export name; the comment lists every section
  // instance that resolved to it.
  type StoryBucket = { exportName: string; sectionInstanceIds: string[] };
  const buckets = new Map<string, StoryBucket>();
  args.sectionInstanceIds.forEach((sectionInstanceId, index) => {
    const exportName = exportForIndex(index, sectionInstanceId);
    const bucket = buckets.get(exportName) ?? {
      exportName,
      sectionInstanceIds: [],
    };
    bucket.sectionInstanceIds.push(sectionInstanceId);
    buckets.set(exportName, bucket);
  });

  const stories = [...buckets.values()].map((bucket) => {
    const storyComponent =
      bucket.exportName === args.implementationName
        ? componentImport
        : `${bucket.exportName}Component`;
    const instances = bucket.sectionInstanceIds.join(", ");
    return `// Section instance${bucket.sectionInstanceIds.length > 1 ? "s" : ""}: ${instances}
export const ${bucket.exportName}: Story = {
  render: () => <${storyComponent} />,
};`;
  });

  return `import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ${componentImport}${namedImports} from "./${args.implementationName}";

const meta = {
  title: "Migrated Components/${args.implementationName}",
  component: ${componentImport},
} satisfies Meta<typeof ${componentImport}>;

export default meta;
type Story = StoryObj<typeof meta>;

${stories.join("\n\n")}
`;
}

function indentLines(s: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return s
    .split("\n")
    .map((line) => (line.length > 0 ? pad + line : line))
    .join("\n");
}

function extractLeadingImports(source: string): {
  imports: string[];
  body: string;
} {
  const imports: string[] = [];
  let body = source;
  while (body.startsWith("import ")) {
    const newlineIndex = body.indexOf("\n");
    if (newlineIndex < 0) break;
    imports.push(body.slice(0, newlineIndex));
    body = body.slice(newlineIndex + 1);
    if (body.startsWith("\n")) body = body.slice(1);
  }
  return { imports, body };
}

export interface ComponentInput {
  id: string;
  name: string;
  memberSections: { id: string; url: string }[];
}

export interface ComponentFilePlan {
  id: string;
  name: string;
  filePath: string;
  memberCount: number;
}

export function planComponentFiles(args: {
  components: ComponentInput[];
}): ComponentFilePlan[] {
  return args.components.map((c, i) => {
    const name = sanitizeComponentName(c.name, i);
    return {
      id: c.id,
      name,
      filePath: `src/components/${name}.tsx`,
      memberCount: c.memberSections.length,
    };
  });
}
