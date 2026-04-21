import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapMigration } from "../lib/bootstrap.ts";

describe("bootstrapMigration", () => {
  it("creates .migration/ skeleton in target dir", async () => {
    const target = mkdtempSync(join(tmpdir(), "bootstrap-"));
    await bootstrapMigration({
      targetDir: target,
      site: {
        sourceUrl: "https://example.com",
        target: "./",
        mode: "attended",
        goal: "pixel-perfect",
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

  it("writes SITE.md with the provided frontmatter", async () => {
    const target = mkdtempSync(join(tmpdir(), "bootstrap-"));
    await bootstrapMigration({
      targetDir: target,
      site: {
        sourceUrl: "https://example.com",
        target: "./",
        mode: "unattended",
        goal: "wireframe",
        inputMode: "url-only",
        maxParallelPages: 4,
        maxParallelSections: 4,
      },
    });
    const contents = readFileSync(join(target, ".migration/SITE.md"), "utf8");
    expect(contents).toContain("sourceUrl: https://example.com");
    expect(contents).toContain("mode: unattended");
    expect(contents).toContain("goal: wireframe");
  });

  it("refuses to overwrite existing .migration/", async () => {
    const target = mkdtempSync(join(tmpdir(), "bootstrap-"));
    const site = {
      sourceUrl: "https://example.com", target: "./",
      mode: "attended" as const, goal: "pixel-perfect" as const, inputMode: "url-only" as const,
      maxParallelPages: 4, maxParallelSections: 4,
    };
    await bootstrapMigration({ targetDir: target, site });
    await expect(bootstrapMigration({ targetDir: target, site })).rejects.toThrow(/already exists/);
  });
});
