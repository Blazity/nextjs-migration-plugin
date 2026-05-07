import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SiteFrontmatterSchema, type SiteFrontmatter, type SiteFrontmatterInput } from "../schemas/site.ts";
import { stringifyFrontmatter } from "./frontmatter.ts";
import { ensureSessionLog } from "./session-log.ts";

export interface BootstrapArgs {
  targetDir: string;
  site: SiteFrontmatterInput;
  description?: string;
}

export async function bootstrapMigration(args: BootstrapArgs): Promise<void> {
  const site = SiteFrontmatterSchema.parse(args.site);
  const migrationDir = join(args.targetDir, ".migration");
  if (existsSync(migrationDir)) {
    throw new Error(`.migration/ already exists in ${args.targetDir}`);
  }

  mkdirSync(migrationDir, { recursive: true });
  mkdirSync(join(migrationDir, "library"), { recursive: true });
  mkdirSync(join(migrationDir, "pages"), { recursive: true });
  mkdirSync(join(migrationDir, "runs/001-initial"), { recursive: true });

  const body = args.description ?? `# ${site.sourceUrl} migration\n`;
  const frontmatter = stringifyFrontmatter(
    site as unknown as Record<string, unknown>,
    body,
  );
  writeFileSync(join(migrationDir, "SITE.md"), frontmatter);

  writeFileSync(
    join(migrationDir, "runs/001-initial/RUN.md"),
    `# Run 001 — initial\n\nScope: ${describeInitialScope(site)}\n\nGoal: ${site.goal}\nMode: ${site.mode}\n`,
  );

  writeFileSync(
    join(migrationDir, "REPORT.md"),
    `# Migration Report\n\n_Accumulated across all runs._\n`,
  );

  ensureSessionLog({ targetDir: args.targetDir, site });
}

function describeInitialScope(site: SiteFrontmatter): string {
  const selection = site.initialPageSelection ?? ["all"];
  if (selection.length === 0 || selection.some(entry => entry.trim().toLowerCase() === "all")) {
    return `all discovered pages from ${site.sourceUrl}`;
  }
  return `selected pages from ${site.sourceUrl}: ${selection.join(", ")}`;
}
