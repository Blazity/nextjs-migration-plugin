import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { AdapterSchema } from "../schemas/adapter.ts";

const readFixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("AdapterSchema", () => {
  it("accepts a valid adapter", () => {
    const valid = readFixture("adapter-valid.json");
    const result = AdapterSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects an adapter with an invalid type enum", () => {
    const invalid = readFixture("adapter-invalid.json");
    const result = AdapterSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("type"))).toBe(true);
    }
  });

  it("rejects an adapter missing required 'version'", () => {
    const invalid = readFixture("adapter-invalid.json");
    const result = AdapterSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("version"))).toBe(true);
    }
  });

  // passthrough() was added to the inner schemas when vendoring real-world
  // adapters, which carry platform-specific extras we don't model (yet). Lock
  // that in — if someone later switches to .strict() or .strip(), this test
  // catches it before the vendored-adapters smoke test runs.
  it("accepts unknown keys on detection, sectionDiscovery, and top-level", () => {
    const valid = readFixture("adapter-valid.json");
    const withExtras = {
      ...valid,
      futureTopLevelField: "reserved",
      detection: { ...valid.detection, novelSignal: "x" },
      sectionDiscovery: { ...valid.sectionDiscovery, customRule: "y" },
    };
    const result = AdapterSchema.safeParse(withExtras);
    expect(result.success).toBe(true);
  });
});
