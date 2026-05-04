import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BuildManifestSchema } from "../schemas/build-manifest.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("BuildManifestSchema", () => {
  it("accepts a valid manifest", () => {
    const data = JSON.parse(readFileSync(fixturePath("build-manifest-valid.json"), "utf8"));
    const result = BuildManifestSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("rejects when generatedAt is missing", () => {
    const data = JSON.parse(readFileSync(fixturePath("build-manifest-invalid.json"), "utf8"));
    const result = BuildManifestSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});
