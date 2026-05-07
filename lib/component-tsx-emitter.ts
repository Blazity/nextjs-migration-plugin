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
