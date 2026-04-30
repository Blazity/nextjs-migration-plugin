import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadProbe } from "../lib/load-probe.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadProbe", () => {
  it("returns { valid: true } for a valid probe.json", () => {
    const result = loadProbe(fixturePath("probe-valid.json"));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.pages).toHaveLength(2);
  });

  it("returns { valid: false, issues } for an invalid probe.json", () => {
    const result = loadProbe(fixturePath("probe-invalid.json"));
    expect(result.valid).toBe(false);
  });
});
