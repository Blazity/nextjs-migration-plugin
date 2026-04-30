import { existsSync } from "node:fs";
import { join } from "node:path";

export const knownPhases = [
  { dir: "phase-1-discover", goalMin: "wireframe" as const },
  { dir: "phase-2-analyze", goalMin: "wireframe" as const },
  { dir: "phase-3-plan", goalMin: "wireframe" as const },
  { dir: "phase-4-extract", goalMin: "wireframe" as const },
  { dir: "phase-5-build", goalMin: "wireframe" as const },
  { dir: "phase-6-visual", goalMin: "pixel-perfect" as const },
  { dir: "phase-7-animate", goalMin: "pixel-perfect" as const },
  { dir: "phase-8-perf", goalMin: "pixel-perfect" as const },
];

export type Goal = "wireframe" | "pixel-perfect";

function inScope(p: typeof knownPhases[number], goal: Goal): boolean {
  if (goal === "pixel-perfect") return true;
  return p.goalMin === "wireframe";
}

export function firstIncompletePhase(
  runDir: string,
  opts: { goal?: Goal } = {},
): string | null {
  const goal = opts.goal ?? "pixel-perfect";
  for (const p of knownPhases) {
    if (!inScope(p, goal)) continue;
    const verified = existsSync(join(runDir, p.dir, "VERIFICATION.md"));
    if (!verified) return p.dir;
  }
  return null;
}

export function completedPhases(runDir: string): string[] {
  return knownPhases
    .map(p => p.dir)
    .filter(d => existsSync(join(runDir, d, "VERIFICATION.md")));
}
