import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadSite } from "./load-site.ts";
import { firstIncompletePhase } from "./phase-status.ts";

export type PhaseDispatcher = (args: { targetDir: string; runDir: string }) => Promise<void>;

export type ResumeResult =
  | { kind: "not-initialized" }
  | { kind: "all-done" }
  | { kind: "dispatched"; phase: string; runDir: string }
  | { kind: "no-dispatcher"; phase: string; runDir: string };

export interface ResumeArgs {
  dispatchers?: Record<string, PhaseDispatcher>;
}

export async function resumeMigration(
  targetDir: string,
  args: ResumeArgs,
): Promise<ResumeResult> {
  const migDir = join(targetDir, ".migration");
  if (!existsSync(migDir)) return { kind: "not-initialized" };

  const siteResult = loadSite(join(migDir, "SITE.md"));
  if (!siteResult.valid) {
    throw new Error(`SITE.md is invalid: ${JSON.stringify(siteResult.issues)}`);
  }

  const runs = readdirSync(join(migDir, "runs"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const activeRun = runs[runs.length - 1] ?? "001-initial";
  const runDir = join(migDir, "runs", activeRun);

  const next = firstIncompletePhase(runDir, { goal: siteResult.site.goal });
  if (next === null) return { kind: "all-done" };

  const dispatcher = args.dispatchers?.[next];
  if (!dispatcher) return { kind: "no-dispatcher", phase: next, runDir: activeRun };

  await dispatcher({ targetDir, runDir: activeRun });
  return { kind: "dispatched", phase: next, runDir: activeRun };
}
