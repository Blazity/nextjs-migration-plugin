import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ComponentsSchema } from "../schemas/components.ts";

const readFixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("ComponentsSchema", () => {
  it("accepts a valid components registry", () => {
    expect(ComponentsSchema.safeParse(readFixture("components-valid.json")).success).toBe(true);
  });

  it("rejects an empty memberSections array", () => {
    expect(ComponentsSchema.safeParse(readFixture("components-invalid.json")).success).toBe(false);
  });
});
