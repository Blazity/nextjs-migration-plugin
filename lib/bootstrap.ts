import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SiteFrontmatter } from "../schemas/site.ts";
import { stringifyFrontmatter } from "./frontmatter.ts";
import { ensureSessionLog } from "./session-log.ts";

export interface BootstrapArgs {
  targetDir: string;
  site: SiteFrontmatter;
  description?: string;
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

  ensureSessionLog({ targetDir: args.targetDir, site: args.site });
}
