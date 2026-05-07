import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SiteFrontmatterSchema, type SiteFrontmatterInput } from "../schemas/site.ts";

export function ensureSessionLog(args: { targetDir: string; site: SiteFrontmatterInput }): void {
  const site = SiteFrontmatterSchema.parse(args.site);
  const path = sessionLogPath(args.targetDir);
  if (existsSync(path)) return;

  const rows = [
    ["Created", new Date().toISOString()],
    ["Source URL", site.sourceUrl],
    ["Target dir", `\`${args.targetDir}\``],
    ["Mode", site.mode],
    ["Goal", site.goal],
    ["Input mode", site.inputMode],
    ["Initial pages", site.initialPageSelection.join(", ")],
  ];
  if (site.sourceRepo) rows.push(["Source repo", `\`${site.sourceRepo}\``]);

  writeFileSync(
    path,
    `# Session log\n\n` +
      `Created for debugging migration runs and plugin behavior across context resets.\n\n` +
      `## Run metadata\n\n` +
      `| Field | Value |\n|---|---|\n` +
      rows.map(([field, value]) => `| ${field} | ${value} |`).join("\n") +
      `\n\n## Events\n\n`,
  );
}

export function appendSessionLog(args: { targetDir: string; title: string; body: string }): void {
  const path = sessionLogPath(args.targetDir);
  if (!existsSync(path)) {
    writeFileSync(path, "# Session log\n\n## Events\n\n");
  }
  appendFileSync(path, `### ${new Date().toISOString()} - ${args.title}\n\n${args.body.trim()}\n\n`);
}

function sessionLogPath(targetDir: string): string {
  const path = join(targetDir, ".migration", "SESSION_LOG.md");
  mkdirSync(dirname(path), { recursive: true });
  return path;
}
