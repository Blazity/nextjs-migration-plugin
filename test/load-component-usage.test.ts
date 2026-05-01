import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadComponentUsage } from "../lib/load-component-usage.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadComponentUsage", () => {
  it("returns { valid: true } for a valid component-usage record", () => {
    const result = loadComponentUsage(fixturePath("component-usage-valid.json"));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.components).toHaveLength(3);
  });

  it("returns { valid: false } for an invalid component-usage record", () => {
    expect(loadComponentUsage(fixturePath("component-usage-invalid.json")).valid).toBe(false);
  });
});
