import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ComponentUsageSchema } from "../schemas/component-usage.ts";

const readFixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("ComponentUsageSchema", () => {
  it("accepts a valid component-usage record", () => {
    expect(ComponentUsageSchema.safeParse(readFixture("component-usage-valid.json")).success).toBe(true);
  });

  it("rejects a negative instances value", () => {
    const result = ComponentUsageSchema.safeParse(readFixture("component-usage-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.join(".").endsWith("instances"))).toBe(true);
    }
  });

  it("rejects an empty slug", () => {
    const result = ComponentUsageSchema.safeParse(readFixture("component-usage-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("slug"))).toBe(true);
    }
  });
});
