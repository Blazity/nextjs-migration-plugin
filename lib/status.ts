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
  // Numeric collation survives past "009" → "010" and "099" → "100".
  const runs = existsSync(runsDir)
    ? readdirSync(runsDir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    : [];
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv.includes("--target")
    ? process.argv[process.argv.indexOf("--target") + 1]
    : process.cwd();
  getStatus(target).then(status => {
    console.log(JSON.stringify(status, null, 2));
  }).catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
