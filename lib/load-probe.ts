import { readFileSync } from "node:fs";
import { ProbeSchema, type Probe } from "../schemas/probe.ts";
import type { LoadResult } from "../schemas/errors.ts";

export function loadProbe(path: string): LoadResult<Probe> {
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
  const result = ProbeSchema.safeParse(rawJson);
  if (result.success) return { valid: true, data: result.data };
  return { valid: false, path, rawJson, issues: result.error.issues };
}
