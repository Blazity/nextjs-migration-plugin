import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadProps } from "../lib/load-props.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadProps", () => {
  it("returns { valid: true } for a valid props.json", () => {
    const result = loadProps(fixturePath("props-valid.json"));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.interfaces).toHaveLength(2);
  });

  it("returns { valid: false } for an invalid props.json", () => {
    expect(loadProps(fixturePath("props-invalid.json")).valid).toBe(false);
  });
});
