import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PropsRegistrySchema } from "../schemas/props.ts";

const readFixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("PropsRegistrySchema", () => {
  it("accepts a valid props registry", () => {
    expect(PropsRegistrySchema.safeParse(readFixture("props-valid.json")).success).toBe(true);
  });

  it("rejects an interface with an empty name", () => {
    expect(PropsRegistrySchema.safeParse(readFixture("props-invalid.json")).success).toBe(false);
  });
});
