import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SiteFrontmatter } from "../schemas/site.ts";

export function ensureSessionLog(args: { targetDir: string; site: SiteFrontmatter }): void {
  const path = sessionLogPath(args.targetDir);
  if (existsSync(path)) return;

  const rows = [
    ["Created", new Date().toISOString()],
    ["Source URL", args.site.sourceUrl],
    ["Target dir", `\`${args.targetDir}\``],
    ["Mode", args.site.mode],
    ["Goal", args.site.goal],
    ["Input mode", args.site.inputMode],
  ];
  if (args.site.sourceRepo) rows.push(["Source repo", `\`${args.site.sourceRepo}\``]);

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
  return join(targetDir, "SESSION-LOG.md");
}
