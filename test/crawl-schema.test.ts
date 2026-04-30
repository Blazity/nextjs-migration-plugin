import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CrawlSchema } from "../schemas/crawl.ts";

const readFixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("CrawlSchema", () => {
  it("accepts a valid crawl", () => {
    const result = CrawlSchema.safeParse(readFixture("crawl-valid.json"));
    expect(result.success).toBe(true);
  });

  it("rejects a non-URL sourceUrl", () => {
    const result = CrawlSchema.safeParse(readFixture("crawl-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("sourceUrl"))).toBe(true);
    }
  });

  it("rejects a non-ISO crawledAt", () => {
    const result = CrawlSchema.safeParse(readFixture("crawl-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("crawledAt"))).toBe(true);
    }
  });

  it("rejects negative maxPages", () => {
    const result = CrawlSchema.safeParse(readFixture("crawl-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.join(".") === "limits.maxPages")).toBe(true);
    }
  });

  it("rejects a page with a non-numeric depth", () => {
    const result = CrawlSchema.safeParse(readFixture("crawl-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.join(".") === "pages.0.depth")).toBe(true);
    }
  });
});
