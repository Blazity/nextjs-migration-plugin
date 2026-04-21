import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadSite } from "./load-site.ts";
import type { SiteFrontmatter } from "../schemas/site.ts";

export type Status =
  | { initialized: false }
  | {
      initialized: true;
      site: SiteFrontmatter;
      activeRun: string;
      completedPhases: string[];
    };

export async function getStatus(targetDir: string): Promise<Status> {
  const migrationDir = join(targetDir, ".migration");
  if (!existsSync(migrationDir)) return { initialized: false };

  const siteResult = loadSite(join(migrationDir, "SITE.md"));
  if (!siteResult.valid) {
    throw new Error(`SITE.md is invalid: ${JSON.stringify(siteResult.issues)}`);
  }

  const runsDir = join(migrationDir, "runs");
  const runs = existsSync(runsDir) ? readdirSync(runsDir).sort() : [];
  const activeRun = runs[runs.length - 1] ?? "001-initial";

  const activeRunDir = join(runsDir, activeRun);
  const completedPhases: string[] = [];
  if (existsSync(activeRunDir)) {
    for (const entry of readdirSync(activeRunDir)) {
      if (entry.startsWith("phase-") && existsSync(join(activeRunDir, entry, "VERIFICATION.md"))) {
        completedPhases.push(entry);
      }
    }
  }

  return { initialized: true, site: siteResult.site, activeRun, completedPhases };
}
