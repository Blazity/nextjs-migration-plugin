import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadAdapter } from "../lib/load-adapter.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadAdapter", () => {
  it("returns { valid: true, adapter } for a valid adapter file", () => {
    const result = loadAdapter(fixturePath("adapter-valid.json"));
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.name).toBe("webflow");
    }
  });

  it("returns { valid: false, issues, rawJson, path } for an invalid adapter", () => {
    const path = fixturePath("adapter-invalid.json");
    const result = loadAdapter(path);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.path).toBe(path);
      expect(Array.isArray(result.issues)).toBe(true);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.rawJson).toEqual({
        name: "broken",
        type: "not-a-valid-type",
        detection: {},
      });
    }
  });

  it("returns { valid: false } with a parse-error issue when file is malformed JSON", () => {
    // Use a known-bad file — create inline for this test
    const { writeFileSync, mkdtempSync } = require("node:fs");
    const { tmpdir } = require("node:os");
    const { join } = require("node:path");
    const dir = mkdtempSync(join(tmpdir(), "adapter-test-"));
    const badPath = join(dir, "bad.json");
    writeFileSync(badPath, "{ not: json }");
    const result = loadAdapter(badPath);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues[0].code).toBe("custom");
      expect(result.issues[0].message).toMatch(/JSON/i);
    }
  });
});
