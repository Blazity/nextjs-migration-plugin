export function sanitizeComponentName(raw: string, fallbackIndex = 0): string {
  const ascii = raw.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const parts = ascii.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length === 0) return `Component${fallbackIndex}`;
  return parts.map(p => p[0].toUpperCase() + p.slice(1)).join("");
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
