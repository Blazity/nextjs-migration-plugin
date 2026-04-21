import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SiteFrontmatter } from "../schemas/site.ts";

export interface BootstrapArgs {
  targetDir: string;
  site: SiteFrontmatter;
  description?: string;
}

// gray-matter's default js-yaml dumper wraps strings containing ":" in single
// quotes (e.g. `sourceUrl: 'https://example.com'`), which breaks the plain
// `sourceUrl: https://example.com` format asserted by loader/status/config
// tests. Serialize plain-scalar YAML ourselves for SITE.md.
function stringifyFrontmatter(data: Record<string, unknown>, body: string): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    lines.push(`${key}: ${value}`);
  }
  lines.push("---", "", body.endsWith("\n") ? body : `${body}\n`);
  return lines.join("\n");
}

export async function bootstrapMigration(args: BootstrapArgs): Promise<void> {
  const migrationDir = join(args.targetDir, ".migration");
  if (existsSync(migrationDir)) {
    throw new Error(`.migration/ already exists in ${args.targetDir}`);
  }

  mkdirSync(migrationDir, { recursive: true });
  mkdirSync(join(migrationDir, "library"), { recursive: true });
  mkdirSync(join(migrationDir, "pages"), { recursive: true });
  mkdirSync(join(migrationDir, "runs/001-initial"), { recursive: true });

  const body = args.description ?? `# ${args.site.sourceUrl} migration\n`;
  const frontmatter = stringifyFrontmatter(
    args.site as unknown as Record<string, unknown>,
    body,
  );
  writeFileSync(join(migrationDir, "SITE.md"), frontmatter);

  writeFileSync(
    join(migrationDir, "runs/001-initial/RUN.md"),
    `# Run 001 — initial\n\nScope: initial migration of ${args.site.sourceUrl}\n\nGoal: ${args.site.goal}\nMode: ${args.site.mode}\n`,
  );

  writeFileSync(
    join(migrationDir, "REPORT.md"),
    `# Migration Report\n\n_Accumulated across all runs._\n`,
  );
}
