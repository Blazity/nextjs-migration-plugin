import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import matter from "gray-matter";
import { bootstrapMigration } from "../lib/bootstrap.ts";

describe("bootstrapMigration", () => {
  it("creates .migration/ skeleton in target dir", async () => {
    const target = mkdtempSync(join(tmpdir(), "bootstrap-"));
    await bootstrapMigration({
      targetDir: target,
      site: {
        sourceUrl: "https://example.com",
        target: "./",
        inputMode: "url-only",
        maxParallelPages: 4,
        maxParallelSections: 4,
      },
    });

    expect(existsSync(join(target, ".migration"))).toBe(true);
    expect(existsSync(join(target, ".migration/SITE.md"))).toBe(true);
    expect(existsSync(join(target, ".migration/library"))).toBe(true);
    expect(existsSync(join(target, ".migration/pages"))).toBe(true);
    expect(existsSync(join(target, ".migration/runs/001-initial"))).toBe(true);
    expect(existsSync(join(target, ".migration/runs/001-initial/RUN.md"))).toBe(true);
  });

  it("writes SITE.md frontmatter and RUN.md without legacy mode or goal fields", async () => {
    const target = mkdtempSync(join(tmpdir(), "bootstrap-"));
    await bootstrapMigration({
      targetDir: target,
      site: {
        sourceUrl: "https://example.com",
        target: "./",
        inputMode: "url-only",
        maxParallelPages: 4,
        maxParallelSections: 4,
      },
    });
    const contents = readFileSync(join(target, ".migration/SITE.md"), "utf8");
    const run = readFileSync(join(target, ".migration/runs/001-initial/RUN.md"), "utf8");
    const frontmatter = matter(contents).data;

    expect(contents).toContain("sourceUrl: https://example.com");
    expect(frontmatter).not.toHaveProperty("mode");
    expect(frontmatter).not.toHaveProperty("goal");
    expect(run).toContain("Scope: all discovered pages from https://example.com");
    expect(run).not.toContain("Mode:");
    expect(run).not.toContain("Goal:");
  });

  it("refuses to overwrite existing .migration/", async () => {
    const target = mkdtempSync(join(tmpdir(), "bootstrap-"));
    const site = {
      sourceUrl: "https://example.com", target: "./",
      inputMode: "url-only" as const,
      maxParallelPages: 4, maxParallelSections: 4,
    };
    await bootstrapMigration({ targetDir: target, site });
    await expect(bootstrapMigration({ targetDir: target, site })).rejects.toThrow(/already exists/);
  });
});
