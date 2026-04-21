import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getStatus } from "../lib/status.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";

const baseSite = {
  sourceUrl: "https://example.com",
  target: "./",
  mode: "attended" as const,
  goal: "pixel-perfect" as const,
  inputMode: "url-only" as const,
  maxParallelPages: 4,
  maxParallelSections: 4,
};

describe("getStatus", () => {
  it("returns { initialized: false } when .migration/ does not exist", async () => {
    const target = mkdtempSync(join(tmpdir(), "status-"));
    const status = await getStatus(target);
    expect(status.initialized).toBe(false);
  });

  it("returns { initialized: true, site, activeRun } after bootstrap", async () => {
    const target = mkdtempSync(join(tmpdir(), "status-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    const status = await getStatus(target);
    expect(status.initialized).toBe(true);
    if (status.initialized) {
      expect(status.site.sourceUrl).toBe("https://example.com");
      expect(status.activeRun).toBe("001-initial");
      expect(status.completedPhases).toEqual([]);
    }
  });

  it("reports completedPhases based on VERIFICATION.md presence", async () => {
    const target = mkdtempSync(join(tmpdir(), "status-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    const phaseDir = join(target, ".migration/runs/001-initial/phase-1-discover");
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(join(phaseDir, "VERIFICATION.md"), "# Verified\n\nStatus: passed\n");
    const status = await getStatus(target);
    if (status.initialized) {
      expect(status.completedPhases).toContain("phase-1-discover");
    }
  });
});
