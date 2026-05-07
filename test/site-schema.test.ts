import { describe, it, expect } from "vitest";
import { SiteFrontmatterSchema, type SiteFrontmatter } from "../schemas/site.ts";

type LegacySiteKeys = "mode" | "goal";
type Assert<T extends true> = T;
type SiteFrontmatterHasNoLegacyKeys = Assert<
  Extract<keyof SiteFrontmatter, LegacySiteKeys> extends never ? true : false
>;

describe("SiteFrontmatterSchema", () => {
  const minimal = {
    sourceUrl: "https://example.com",
    target: "./",
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

  it("rejects unknown legacy keys 'mode' and 'goal'", () => {
    const result = SiteFrontmatterSchema.safeParse({
      ...minimal,
      mode: "attended",
      goal: "wireframe",
    });
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

  it("parses a minimal site with only sourceUrl, target, and inputMode", () => {
    const result = SiteFrontmatterSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect("mode" in result.data).toBe(false);
      expect("goal" in result.data).toBe(false);
      expect(result.data.initialPageSelection).toEqual(["all"]);
      expect(result.data.maxParallelPages).toBe(4);
      expect(result.data.maxParallelSections).toBe(4);
    }
  });
});
