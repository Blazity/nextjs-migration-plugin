import { readFileSync } from "node:fs";
import { PageSpecManifestSchema, type PageSpecManifest } from "../schemas/page-spec.ts";
import type { LoadResult } from "../schemas/errors.ts";

export function loadPageSpec(path: string): LoadResult<PageSpecManifest> {
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
  const result = PageSpecManifestSchema.safeParse(rawJson);
  if (result.success) return { valid: true, data: result.data };
  return { valid: false, path, rawJson, issues: result.error.issues };
}
