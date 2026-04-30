import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadComponents } from "../lib/load-components.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadComponents", () => {
  it("returns { valid: true } for a valid components.json", () => {
    const result = loadComponents(fixturePath("components-valid.json"));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.components).toHaveLength(2);
  });

  it("returns { valid: false } for an invalid components.json", () => {
    expect(loadComponents(fixturePath("components-invalid.json")).valid).toBe(false);
  });
});
