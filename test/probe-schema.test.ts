import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ProbeSchema } from "../schemas/probe.ts";

const readFixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("ProbeSchema", () => {
  it("accepts a valid probe", () => {
    expect(ProbeSchema.safeParse(readFixture("probe-valid.json")).success).toBe(true);
  });

  it("rejects an invalid recommendation enum value", () => {
    const result = ProbeSchema.safeParse(readFixture("probe-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.join(".") === "pages.0.recommendation")).toBe(true);
    }
  });

  it("rejects a non-ISO probedAt", () => {
    const result = ProbeSchema.safeParse(readFixture("probe-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("probedAt"))).toBe(true);
    }
  });
});
