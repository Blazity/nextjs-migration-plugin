import { readFileSync } from "node:fs";
import matter from "gray-matter";
import { RoadmapSchema, type Roadmap } from "../schemas/roadmap.ts";
import type { LoadResult } from "../schemas/errors.ts";

export function loadRoadmap(path: string): LoadResult<Roadmap> {
  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(readFileSync(path, "utf8"));
  } catch (err) {
    return {
      valid: false,
      path,
      rawJson: null,
      issues: [{ code: "custom", path: [], message: `Failed to read/parse: ${(err as Error).message}` }],
    };
  }
  const result = RoadmapSchema.safeParse(parsed.data);
  if (result.success) return { valid: true, data: result.data };
  return { valid: false, path, rawJson: parsed.data, issues: result.error.issues };
}
