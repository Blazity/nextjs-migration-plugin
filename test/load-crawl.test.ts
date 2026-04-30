import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadCrawl } from "../lib/load-crawl.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadCrawl", () => {
  it("returns { valid: true } for a valid crawl.json", () => {
    const result = loadCrawl(fixturePath("crawl-valid.json"));
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.pages).toHaveLength(2);
    }
  });

  it("returns { valid: false, issues, rawJson, path } for an invalid crawl.json", () => {
    const path = fixturePath("crawl-invalid.json");
    const result = loadCrawl(path);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.path).toBe(path);
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
});
