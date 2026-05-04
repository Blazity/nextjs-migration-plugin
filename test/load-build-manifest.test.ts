import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadBuildManifest } from "../lib/load-build-manifest.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadBuildManifest", () => {
  it("returns valid result for a schema-valid file", () => {
    const result = loadBuildManifest(fixturePath("build-manifest-valid.json"));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.components).toHaveLength(1);
  });

  it("returns invalid result for a schema-invalid file", () => {
    const result = loadBuildManifest(fixturePath("build-manifest-invalid.json"));
    expect(result.valid).toBe(false);
  });

  it("returns invalid result for a missing file", () => {
    const result = loadBuildManifest("/nope/missing.json");
    expect(result.valid).toBe(false);
  });
});
