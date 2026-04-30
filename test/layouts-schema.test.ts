import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { LayoutsSchema } from "../schemas/layouts.ts";

const readFixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("LayoutsSchema", () => {
  it("accepts a valid layouts file with header + footer + null nav", () => {
    expect(LayoutsSchema.safeParse(readFixture("layouts-valid.json")).success).toBe(true);
  });

  it("rejects missing required header fields", () => {
    expect(LayoutsSchema.safeParse(readFixture("layouts-invalid.json")).success).toBe(false);
  });

  it("rejects a non-ISO updatedAt", () => {
    const result = LayoutsSchema.safeParse(readFixture("layouts-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("updatedAt"))).toBe(true);
    }
  });
});
