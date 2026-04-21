import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadSite } from "../lib/load-site.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadSite", () => {
  it("parses frontmatter and body from SITE.md", () => {
    const result = loadSite(fixturePath("site-valid.md"));
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.site.sourceUrl).toBe("https://example.com");
      expect(result.site.mode).toBe("attended");
      expect(result.body.trim().startsWith("# example.com migration")).toBe(true);
    }
  });

  it("returns invalid result when required field is missing", () => {
    const { writeFileSync, mkdtempSync } = require("node:fs");
    const { tmpdir } = require("node:os");
    const { join } = require("node:path");
    const dir = mkdtempSync(join(tmpdir(), "site-test-"));
    const path = join(dir, "SITE.md");
    writeFileSync(path, "---\ntarget: ./\n---\n\n# no source URL");
    const result = loadSite(path);
    expect(result.valid).toBe(false);
  });
});
