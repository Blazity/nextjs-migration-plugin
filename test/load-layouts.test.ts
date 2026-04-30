import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadLayouts } from "../lib/load-layouts.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadLayouts", () => {
  it("returns { valid: true } for a valid layouts.json", () => {
    const result = loadLayouts(fixturePath("layouts-valid.json"));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.header?.id).toBe("layout-header-1");
  });

  it("returns { valid: false } for an invalid layouts.json", () => {
    expect(loadLayouts(fixturePath("layouts-invalid.json")).valid).toBe(false);
  });
});
