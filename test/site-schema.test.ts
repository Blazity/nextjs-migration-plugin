import { describe, it, expect } from "vitest";
import { SiteFrontmatterSchema } from "../schemas/site.ts";

describe("SiteFrontmatterSchema", () => {
  const minimal = {
    sourceUrl: "https://example.com",
    target: "./",
    mode: "attended",
    goal: "pixel-perfect",
    inputMode: "url-only",
  };

  it("accepts a minimal valid frontmatter", () => {
    const result = SiteFrontmatterSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it("rejects missing sourceUrl", () => {
    const { sourceUrl, ...incomplete } = minimal;
    const result = SiteFrontmatterSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it("rejects invalid mode enum", () => {
    const result = SiteFrontmatterSchema.safeParse({ ...minimal, mode: "weird" });
    expect(result.success).toBe(false);
  });

  it("rejects reserved inputMode 'content-migration' in v1", () => {
    const result = SiteFrontmatterSchema.safeParse({ ...minimal, inputMode: "content-migration" });
    expect(result.success).toBe(false);
  });

  it("accepts optional sourceRepo when inputMode is url-plus-repo", () => {
    const result = SiteFrontmatterSchema.safeParse({
      ...minimal,
      inputMode: "url-plus-repo",
      sourceRepo: "/Users/dev/example",
    });
    expect(result.success).toBe(true);
  });

  it("defaults maxParallelPages and maxParallelSections to 4", () => {
    const result = SiteFrontmatterSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxParallelPages).toBe(4);
      expect(result.data.maxParallelSections).toBe(4);
    }
  });
});
