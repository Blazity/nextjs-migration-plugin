import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadPageSpec } from "../lib/load-page-spec.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadPageSpec", () => {
  it("returns { valid: true } for a valid page-spec manifest", () => {
    const result = loadPageSpec(fixturePath("page-spec-valid.json"));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.slug).toBe("home");
  });

  it("returns { valid: false } for an invalid page-spec manifest", () => {
    expect(loadPageSpec(fixturePath("page-spec-invalid.json")).valid).toBe(false);
  });
});
