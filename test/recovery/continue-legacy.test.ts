import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapMigration } from "../../lib/bootstrap.ts";
import { resumeLegacyMigration } from "../../lib/recovery-continue.ts";

const baseSite = {
  sourceUrl: "https://example.com",
  target: "./",
  inputMode: "url-only" as const,
  maxParallelPages: 4,
  maxParallelSections: 4,
};

describe("resumeLegacyMigration", () => {
  it("returns not-initialized when there is no .migration directory", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "legacy-cont-"));

    await expect(resumeLegacyMigration(targetDir, {})).resolves.toEqual({
      kind: "not-initialized",
    });
  });

  it("dispatches phase-1-discover on a fresh legacy bootstrap", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "legacy-cont-"));
    await bootstrapMigration({ targetDir, site: baseSite });
    const phase1 = vi.fn(async () => {});

    const result = await resumeLegacyMigration(targetDir, {
      dispatchers: { "phase-1-discover": phase1 },
    });

    expect(result).toEqual({
      kind: "dispatched",
      phase: "phase-1-discover",
      runDir: "001-initial",
    });
    expect(phase1).toHaveBeenCalledWith({
      targetDir,
      runDir: "001-initial",
    });
  });

  it("reports the next legacy phase when no dispatcher is registered", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "legacy-cont-"));
    await bootstrapMigration({ targetDir, site: baseSite });
    const phaseDir = join(targetDir, ".migration/runs/001-initial/phase-1-discover");
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(join(phaseDir, "VERIFICATION.md"), "# verified");

    await expect(resumeLegacyMigration(targetDir, {})).resolves.toEqual({
      kind: "no-dispatcher",
      phase: "phase-2-analyze",
      runDir: "001-initial",
    });
  });

  it("resumes a legacy polish run at phase-6-visual", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "legacy-cont-"));
    await bootstrapMigration({ targetDir, site: baseSite });
    const polishRun = join(targetDir, ".migration/runs/002-polish-all");
    mkdirSync(polishRun, { recursive: true });
    writeFileSync(join(polishRun, "RUN.md"), "# Run 002\n\nRun type: polish\n");
    const phase6 = vi.fn(async () => {});

    const result = await resumeLegacyMigration(targetDir, {
      dispatchers: { "phase-6-visual": phase6 },
    });

    expect(result).toEqual({
      kind: "dispatched",
      phase: "phase-6-visual",
      runDir: "002-polish-all",
    });
  });
});
