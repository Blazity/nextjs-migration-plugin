import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendSessionLog, ensureSessionLog } from "../lib/session-log.ts";

const baseSite = {
  sourceUrl: "https://example.com",
  target: "./",
  mode: "unattended" as const,
  goal: "pixel-perfect" as const,
  inputMode: "url-only" as const,
  maxParallelPages: 4,
  maxParallelSections: 4,
};

describe("session log", () => {
  it("creates the canonical log inside .migration and not at target root", () => {
    const target = mkdtempSync(join(tmpdir(), "session-log-"));

    ensureSessionLog({ targetDir: target, site: baseSite });

    const migrationLog = join(target, ".migration/SESSION_LOG.md");
    expect(existsSync(migrationLog)).toBe(true);
    expect(existsSync(join(target, "SESSION-LOG.md"))).toBe(false);

    const contents = readFileSync(migrationLog, "utf8");
    expect(contents).toContain("# Session log");
    expect(contents).toContain("Source URL | https://example.com");
    expect(contents).toContain("Goal | pixel-perfect");
  });

  it("does not overwrite an existing canonical log", () => {
    const target = mkdtempSync(join(tmpdir(), "session-log-"));
    const migrationLog = join(target, ".migration/SESSION_LOG.md");
    mkdirSync(join(target, ".migration"), { recursive: true });
    writeFileSync(migrationLog, "existing log");

    ensureSessionLog({ targetDir: target, site: baseSite });

    expect(readFileSync(migrationLog, "utf8")).toBe("existing log");
  });

  it("appends events to the canonical log inside .migration", () => {
    const target = mkdtempSync(join(tmpdir(), "session-log-"));
    ensureSessionLog({ targetDir: target, site: baseSite });

    appendSessionLog({
      targetDir: target,
      title: "Phase 5 build",
      body: "Generated 3 components.",
    });

    const contents = readFileSync(join(target, ".migration/SESSION_LOG.md"), "utf8");
    expect(contents).toContain("Phase 5 build");
    expect(contents).toContain("Generated 3 components.");
    expect(existsSync(join(target, "SESSION-LOG.md"))).toBe(false);
  });
});
