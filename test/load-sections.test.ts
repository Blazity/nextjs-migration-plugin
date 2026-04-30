import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadSections } from "../lib/load-sections.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadSections", () => {
  it("returns { valid: true } for a valid sections.json", () => {
    const result = loadSections(fixturePath("sections-valid.json"));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.pages).toHaveLength(1);
  });

  it("returns { valid: false, issues } for an invalid sections.json", () => {
    const result = loadSections(fixturePath("sections-invalid.json"));
    expect(result.valid).toBe(false);
  });
});
