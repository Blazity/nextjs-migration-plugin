import { readFileSync } from "node:fs";
import { AdapterSchema, type Adapter } from "../schemas/adapter.ts";
import type { LoadResult } from "../schemas/errors.ts";

export function loadAdapter(path: string): LoadResult<Adapter> {
  let rawJson: unknown;
  try {
    const contents = readFileSync(path, "utf8");
    rawJson = JSON.parse(contents);
  } catch (err) {
    return {
      valid: false,
      path,
      rawJson: null,
      issues: [{
        code: "custom",
        path: [],
        message: `Failed to parse JSON: ${(err as Error).message}`,
      }],
    };
  }

  const result = AdapterSchema.safeParse(rawJson);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  return {
    valid: false,
    path,
    rawJson,
    issues: result.error.issues,
  };
}
