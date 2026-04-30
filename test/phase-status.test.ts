import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { firstIncompletePhase, completedPhases, knownPhases } from "../lib/phase-status.ts";

function makeRun(): string {
  const root = mkdtempSync(join(tmpdir(), "phase-status-"));
  const run = join(root, ".migration/runs/001-initial");
  mkdirSync(run, { recursive: true });
  return run;
}

describe("phase-status", () => {
  it("knownPhases lists the 8 phases in order", () => {
    expect(knownPhases.map(p => p.dir)).toEqual([
      "phase-1-discover",
      "phase-2-analyze",
      "phase-3-plan",
      "phase-4-extract",
      "phase-5-build",
      "phase-6-visual",
      "phase-7-animate",
      "phase-8-perf",
    ]);
  });

  it("returns phase-1-discover when no phase dirs exist", () => {
    const run = makeRun();
    expect(firstIncompletePhase(run)).toBe("phase-1-discover");
    expect(completedPhases(run)).toEqual([]);
  });

  it("skips phases with VERIFICATION.md present", () => {
    const run = makeRun();
    const p1 = join(run, "phase-1-discover");
    mkdirSync(p1, { recursive: true });
    writeFileSync(join(p1, "VERIFICATION.md"), "# verified");
    expect(firstIncompletePhase(run)).toBe("phase-2-analyze");
    expect(completedPhases(run)).toEqual(["phase-1-discover"]);
  });

  it("returns null when all known phases are verified", () => {
    const run = makeRun();
    for (const p of ["phase-1-discover", "phase-2-analyze", "phase-3-plan",
                     "phase-4-extract", "phase-5-build", "phase-6-visual",
                     "phase-7-animate", "phase-8-perf"]) {
      const dir = join(run, p);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "VERIFICATION.md"), "# verified");
    }
    expect(firstIncompletePhase(run)).toBeNull();
  });

  it("respects 'wireframe' goal — stops after phase-5-build", () => {
    const run = makeRun();
    for (const p of ["phase-1-discover", "phase-2-analyze", "phase-3-plan",
                     "phase-4-extract", "phase-5-build"]) {
      const dir = join(run, p);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "VERIFICATION.md"), "# verified");
    }
    expect(firstIncompletePhase(run, { goal: "wireframe" })).toBeNull();
  });
});
