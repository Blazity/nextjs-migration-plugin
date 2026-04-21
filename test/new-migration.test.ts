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
