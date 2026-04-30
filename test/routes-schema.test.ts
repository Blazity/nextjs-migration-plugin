import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { RoutesSchema } from "../schemas/routes.ts";

const readFixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("RoutesSchema", () => {
  it("accepts a valid routes file", () => {
    expect(RoutesSchema.safeParse(readFixture("routes-valid.json")).success).toBe(true);
  });

  it("rejects an invalid kind enum value", () => {
    const result = RoutesSchema.safeParse(readFixture("routes-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.join(".").endsWith("kind"))).toBe(true);
    }
  });

  it("rejects a non-URL sourceUrl", () => {
    const result = RoutesSchema.safeParse(readFixture("routes-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.join(".").endsWith("sourceUrl"))).toBe(true);
    }
  });
});
