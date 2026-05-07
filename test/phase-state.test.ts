import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writePlan,
  writeExecution,
  writeVerification,
  readVerification,
} from "../lib/phase-state.ts";

function tempPhaseDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "phase-state-"));
  const phaseDir = join(dir, "phase-1-discover");
  mkdirSync(phaseDir, { recursive: true });
  return phaseDir;
}

describe("phase-state", () => {
  it("writePlan creates PLAN.md with the provided body", async () => {
    const phaseDir = tempPhaseDir();
    await writePlan(phaseDir, "Crawl https://example.com");
    const contents = readFileSync(join(phaseDir, "PLAN.md"), "utf8");
    expect(contents).toContain("Crawl https://example.com");
  });

  it("writeExecution appends a timestamped entry", async () => {
    const phaseDir = tempPhaseDir();
    await writeExecution(phaseDir, "Crawl complete: 3 pages.");
    await writeExecution(phaseDir, "Probe complete: 3 pages.");
    const contents = readFileSync(join(phaseDir, "EXECUTION.md"), "utf8");
    expect(contents).toMatch(/Crawl complete/);
    expect(contents).toMatch(/Probe complete/);
    expect(contents.match(/\d{4}-\d{2}-\d{2}T/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("writeVerification writes a markdown file AND the JSON sidecar", async () => {
    const phaseDir = tempPhaseDir();
    await writeVerification(phaseDir, {
      phase: "phase-1-discover",
      passed: true,
      checkedAt: "2026-04-29T12:00:00.000Z",
      criteria: [
        { name: "crawl.json valid", passed: true },
        { name: "every page has adapter or ABORT", passed: true },
      ],
    });
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "verification.json"))).toBe(true);
    const md = readFileSync(join(phaseDir, "VERIFICATION.md"), "utf8");
    expect(md).toContain("# Verification");
    expect(md).toContain("✅");
  });

  it("does NOT write VERIFICATION.md when passed: false", async () => {
    const phaseDir = tempPhaseDir();
    await writeVerification(phaseDir, {
      phase: "phase-1-discover",
      passed: false,
      checkedAt: "2026-04-29T12:00:00.000Z",
      criteria: [{ name: "x", passed: false, detail: "missing" }],
    });
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(false);
    expect(existsSync(join(phaseDir, "verification.json"))).toBe(true);
  });

  it("removes stale VERIFICATION.md when a later verification fails", async () => {
    const phaseDir = tempPhaseDir();
    await writeVerification(phaseDir, {
      phase: "phase-1-discover",
      passed: true,
      checkedAt: "2026-04-29T12:00:00.000Z",
      criteria: [{ name: "x", passed: true }],
    });
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(true);

    await writeVerification(phaseDir, {
      phase: "phase-1-discover",
      passed: false,
      checkedAt: "2026-04-29T12:01:00.000Z",
      criteria: [{ name: "x", passed: false, detail: "regressed" }],
    });

    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(false);
    const json = JSON.parse(readFileSync(join(phaseDir, "verification.json"), "utf8"));
    expect(json.passed).toBe(false);
  });

  it("readVerification round-trips the JSON sidecar", async () => {
    const phaseDir = tempPhaseDir();
    const v = {
      phase: "phase-1-discover",
      passed: true,
      checkedAt: "2026-04-29T12:00:00.000Z",
      criteria: [{ name: "x", passed: true }],
    };
    await writeVerification(phaseDir, v);
    const read = await readVerification(phaseDir);
    expect(read).toEqual(v);
  });
});
