import { readFileSync } from "node:fs";
import matter from "gray-matter";
import { SiteFrontmatterSchema, type SiteFrontmatter } from "../schemas/site.ts";
import type { z } from "zod";

export type SiteLoadResult =
  | { valid: true; site: SiteFrontmatter; body: string }
  | { valid: false; issues: z.ZodIssue[]; rawFrontmatter: unknown; path: string };

export function loadSite(path: string): SiteLoadResult {
  const contents = readFileSync(path, "utf8");
  const parsed = matter(contents);
  const result = SiteFrontmatterSchema.safeParse(parsed.data);
  if (result.success) {
    return { valid: true, site: result.data, body: parsed.content };
  }
  return {
    valid: false,
    issues: result.error.issues,
    rawFrontmatter: parsed.data,
    path,
  };
}
