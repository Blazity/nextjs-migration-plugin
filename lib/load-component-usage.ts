import { readFileSync } from "node:fs";
import { ComponentUsageSchema, type ComponentUsage } from "../schemas/component-usage.ts";
import type { LoadResult } from "../schemas/errors.ts";

export function loadComponentUsage(path: string): LoadResult<ComponentUsage> {
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
  const result = ComponentUsageSchema.safeParse(rawJson);
  if (result.success) return { valid: true, data: result.data };
  return { valid: false, path, rawJson, issues: result.error.issues };
}
