import { z } from "zod";

export const SiteFrontmatterSchema = z.object({
  sourceUrl: z.string().url(),
  target: z.string(),
  mode: z.enum(["attended", "unattended"]),
  goal: z.enum(["wireframe", "pixel-perfect"]),
  inputMode: z.enum(["url-only", "url-plus-repo"]),
  sourceRepo: z.string().optional(),
  maxParallelPages: z.number().int().positive().default(4),
  maxParallelSections: z.number().int().positive().default(4),
});

export type SiteFrontmatter = z.infer<typeof SiteFrontmatterSchema>;
