import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resumeMigration } from "../lib/continue.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";

const baseSite = {
  sourceUrl: "https://example.com",
  target: "./",
  inputMode: "url-only" as const,
  maxParallelPages: 4,
  maxParallelSections: 4,
};

describe("resumeMigration", () => {
  it("returns { kind: 'not-initialized' } when there is no .migration/", async () => {
    const target = mkdtempSync(join(tmpdir(), "cont-"));
    const result = await resumeMigration(target, {});
    expect(result.kind).toBe("not-initialized");
  });

  it("dispatches phase-1-discover on a fresh bootstrap", async () => {
    const target = mkdtempSync(join(tmpdir(), "cont-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    const dispatched: string[] = [];
    const dispatchers = {
      "phase-1-discover": vi.fn(async () => { dispatched.push("phase-1-discover"); }),
    };
    const result = await resumeMigration(target, { dispatchers });
    expect(result.kind).toBe("dispatched");
    if (result.kind === "dispatched") expect(result.phase).toBe("phase-1-discover");
    expect(dispatched).toEqual(["phase-1-discover"]);
  });

  it("continues to phase-6-visual after Phase 5 in the single guided flow", async () => {
    const target = mkdtempSync(join(tmpdir(), "cont-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    const run = join(target, ".migration/runs/001-initial");
    for (const p of ["phase-1-discover", "phase-2-analyze", "phase-3-plan",
                     "phase-4-extract", "phase-5-build"]) {
      mkdirSync(join(run, p), { recursive: true });
      writeFileSync(join(run, p, "VERIFICATION.md"), "# verified");
    }
    const result = await resumeMigration(target, {});
    expect(result.kind).toBe("no-dispatcher");
    if (result.kind === "no-dispatcher") expect(result.phase).toBe("phase-6-visual");
  });

  it("dispatches phase-6-visual after Phase 5", async () => {
    const target = mkdtempSync(join(tmpdir(), "cont-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    const run = join(target, ".migration/runs/001-initial");
    for (const p of ["phase-1-discover", "phase-2-analyze", "phase-3-plan",
                     "phase-4-extract", "phase-5-build"]) {
      mkdirSync(join(run, p), { recursive: true });
      writeFileSync(join(run, p, "VERIFICATION.md"), "# verified");
    }
    const dispatched: string[] = [];
    const result = await resumeMigration(target, {
      dispatchers: {
        "phase-6-visual": vi.fn(async () => { dispatched.push("phase-6-visual"); }),
      },
    });

    expect(result.kind).toBe("dispatched");
    if (result.kind === "dispatched") expect(result.phase).toBe("phase-6-visual");
    expect(dispatched).toEqual(["phase-6-visual"]);
  });

  it("resumes an active polish run at phase-6-visual instead of phase-1-discover", async () => {
    const target = mkdtempSync(join(tmpdir(), "cont-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    const polishRun = join(target, ".migration/runs/002-polish-all");
    mkdirSync(polishRun, { recursive: true });
    writeFileSync(join(polishRun, "RUN.md"), "# Run 002 — polish all\n\nRun type: polish\nScope key: all\n");
    const dispatched: string[] = [];

    const result = await resumeMigration(target, {
      dispatchers: {
        "phase-6-visual": vi.fn(async () => { dispatched.push("phase-6-visual"); }),
      },
    });

    expect(result.kind).toBe("dispatched");
    if (result.kind === "dispatched") expect(result.phase).toBe("phase-6-visual");
    expect(dispatched).toEqual(["phase-6-visual"]);
  });

  it("reports phase-7-animate pending after an active polish run verifies Phase 6", async () => {
    const target = mkdtempSync(join(tmpdir(), "cont-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    const polishRun = join(target, ".migration/runs/002-polish-all");
    mkdirSync(join(polishRun, "phase-6-visual"), { recursive: true });
    writeFileSync(join(polishRun, "RUN.md"), "# Run 002 — polish all\n\nRun type: polish\nScope key: all\n");
    writeFileSync(join(polishRun, "phase-6-visual/VERIFICATION.md"), "# verified");

    const result = await resumeMigration(target, { dispatchers: {} });

    expect(result.kind).toBe("no-dispatcher");
    if (result.kind === "no-dispatcher") expect(result.phase).toBe("phase-7-animate");
  });

  it("returns { kind: 'no-dispatcher', phase } when the next phase has no registered dispatcher", async () => {
    const target = mkdtempSync(join(tmpdir(), "cont-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    const run = join(target, ".migration/runs/001-initial");
    mkdirSync(join(run, "phase-1-discover"), { recursive: true });
    writeFileSync(join(run, "phase-1-discover/VERIFICATION.md"), "# verified");
    const result = await resumeMigration(target, { dispatchers: {} });
    expect(result.kind).toBe("no-dispatcher");
    if (result.kind === "no-dispatcher") expect(result.phase).toBe("phase-2-analyze");
  });
});
