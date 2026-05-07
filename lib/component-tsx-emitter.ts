export function sanitizeComponentName(raw: string, fallbackIndex = 0): string {
  const ascii = raw.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const parts = ascii.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length === 0) return `Component${fallbackIndex}`;
  return parts.map(p => p[0].toUpperCase() + p.slice(1)).join("");
}

export type ApprovedNameValidation =
  | { ok: true }
  | { ok: false; reason: "implementation name must be semantic PascalCase" };

export function validateApprovedName(name: string): ApprovedNameValidation {
  if (
    !/^[A-Z][A-Za-z0-9]*$/.test(name) ||
    /^(?:Component\d+|Section\d+)$/.test(name) ||
    /p\d+-s\d+/.test(name)
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
    return raw.replace(/export\s+default\s+function\s+\w+/, `export default function ${name}`);
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

export function renderComponentStories(args: {
  implementationName: string;
  sectionInstanceIds: string[];
}): string {
  const componentImport = `${args.implementationName}Component`;
  const stories = args.sectionInstanceIds.map((sectionInstanceId, index) => {
    const storyName = index === 0
      ? args.implementationName
      : `${args.implementationName}Variant${index + 1}`;
    return `// Section instance: ${sectionInstanceId}
export const ${storyName}: Story = {};`;
  });

  return `import type { Meta, StoryObj } from "@storybook/react";
import ${componentImport} from "./${args.implementationName}";

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
  return s.split("\n").map(line => (line.length > 0 ? pad + line : line)).join("\n");
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

export function planComponentFiles(args: { components: ComponentInput[] }): ComponentFilePlan[] {
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
