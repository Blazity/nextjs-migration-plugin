import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runNewMigration } from "../lib/new-migration.ts";

describe("runNewMigration", () => {
  it("creates .migration/ with correct frontmatter from args", async () => {
    const target = mkdtempSync(join(tmpdir(), "newmig-"));
    await runNewMigration({
      sourceUrl: "https://example.com",
      targetDir: target,
      mode: "attended",
      goal: "pixel-perfect",
      inputMode: "url-only",
    });
    const site = readFileSync(join(target, ".migration/SITE.md"), "utf8");
    expect(site).toContain("sourceUrl: https://example.com");
    expect(site).toContain("goal: pixel-perfect");

    const sessionLog = readFileSync(join(target, ".migration/SESSION_LOG.md"), "utf8");
    expect(sessionLog).toContain("# Session log");
    expect(sessionLog).toContain("Source URL | https://example.com");
    expect(sessionLog).toContain("Goal | pixel-perfect");
    expect(existsSync(join(target, "SESSION-LOG.md"))).toBe(false);
  });

  it("passes sourceRepo through when inputMode is url-plus-repo", async () => {
    const target = mkdtempSync(join(tmpdir(), "newmig-"));
    await runNewMigration({
      sourceUrl: "https://example.com",
      targetDir: target,
      mode: "attended",
      goal: "pixel-perfect",
      inputMode: "url-plus-repo",
      sourceRepo: "/tmp/source-repo",
    });
    const site = readFileSync(join(target, ".migration/SITE.md"), "utf8");
    expect(site).toContain("inputMode: url-plus-repo");
    expect(site).toContain("sourceRepo: /tmp/source-repo");
  });

  it("persists the initial page selection in SITE.md and RUN.md", async () => {
    const target = mkdtempSync(join(tmpdir(), "newmig-"));
    await runNewMigration({
      sourceUrl: "https://example.com",
      targetDir: target,
      mode: "attended",
      goal: "pixel-perfect",
      inputMode: "url-only",
      initialPageSelection: ["/", "/about"],
    } as Parameters<typeof runNewMigration>[0] & { initialPageSelection: string[] });

    const site = readFileSync(join(target, ".migration/SITE.md"), "utf8");
    expect(site).toContain('initialPageSelection: ["/","/about"]');

    const run = readFileSync(join(target, ".migration/runs/001-initial/RUN.md"), "utf8");
    expect(run).toContain("Scope: selected pages from https://example.com: /, /about");
  });

  it("rejects when targetDir already has .migration/", async () => {
    const target = mkdtempSync(join(tmpdir(), "newmig-"));
    await runNewMigration({
      sourceUrl: "https://example.com",
      targetDir: target,
      mode: "attended",
      goal: "pixel-perfect",
      inputMode: "url-only",
    });
    await expect(runNewMigration({
      sourceUrl: "https://example.com",
      targetDir: target,
      mode: "attended",
      goal: "pixel-perfect",
      inputMode: "url-only",
    })).rejects.toThrow();
  });
});
