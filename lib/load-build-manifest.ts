import { readFileSync } from "node:fs";
import { BuildManifestSchema, type BuildManifest } from "../schemas/build-manifest.ts";
import type { LoadResult } from "../schemas/errors.ts";

export function loadBuildManifest(path: string): LoadResult<BuildManifest> {
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return {
      valid: false,
      path,
      rawJson: null,
      issues: [{ code: "custom", path: [], message: `Failed to parse JSON: ${(err as Error).message}` }],
    };
  }
  const result = BuildManifestSchema.safeParse(rawJson);
  if (result.success) return { valid: true, data: result.data };
  return { valid: false, path, rawJson, issues: result.error.issues };
}
