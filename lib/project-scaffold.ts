import { existsSync } from "node:fs";
import { join } from "node:path";

export type ScaffoldCheckResult =
  | { ok: true }
  | { ok: false; missing: string[] };

export function checkProjectScaffold(targetDir: string): ScaffoldCheckResult {
  const required = ["package.json", "src/app/layout.tsx"];
  const missing = required.filter(p => !existsSync(join(targetDir, p)));
  if (missing.length === 0) return { ok: true };
  return { ok: false, missing };
}
