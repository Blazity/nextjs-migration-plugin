import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { SiteFrontmatterSchema } from "../schemas/site.ts";
import { stringifyFrontmatter } from "./frontmatter.ts";

const NUMERIC_KEYS = new Set(["maxParallelPages", "maxParallelSections"]);
const ALLOWED_KEYS = new Set([
  "mode", "goal", "inputMode", "sourceRepo", "maxParallelPages", "maxParallelSections",
]);

export async function setConfig(targetDir: string, key: string, value: string): Promise<void> {
  if (!ALLOWED_KEYS.has(key)) {
    throw new Error(`Unknown config key: ${key}`);
  }
  const sitePath = join(targetDir, ".migration/SITE.md");
  const contents = readFileSync(sitePath, "utf8");
  const parsed = matter(contents);

  const next = { ...parsed.data, [key]: NUMERIC_KEYS.has(key) ? Number(value) : value };
  const validation = SiteFrontmatterSchema.safeParse(next);
  if (!validation.success) {
    throw new Error(`Invalid value for ${key}: ${validation.error.issues.map(i => i.message).join("; ")}`);
  }

  const updated = stringifyFrontmatter(
    validation.data as unknown as Record<string, unknown>,
    parsed.content,
  );
  writeFileSync(sitePath, updated);
}
