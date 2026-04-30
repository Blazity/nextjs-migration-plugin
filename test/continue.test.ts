import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resumeMigration } from "../lib/continue.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";

const baseSite = {
  sourceUrl: "https://example.com",
  target: "./",
  mode: "unattended" as const,
  goal: "wireframe" as const,
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

  it("returns { kind: 'all-done' } when wireframe goal phases 1-5 are all verified", async () => {
    const target = mkdtempSync(join(tmpdir(), "cont-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    const run = join(target, ".migration/runs/001-initial");
    for (const p of ["phase-1-discover", "phase-2-analyze", "phase-3-plan",
                     "phase-4-extract", "phase-5-build"]) {
      mkdirSync(join(run, p), { recursive: true });
      writeFileSync(join(run, p, "VERIFICATION.md"), "# verified");
    }
    const result = await resumeMigration(target, {});
    expect(result.kind).toBe("all-done");
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
