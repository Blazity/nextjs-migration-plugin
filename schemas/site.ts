import { z } from "zod";

export const SiteFrontmatterSchema = z.object({
  sourceUrl: z.string().url(),
  target: z.string(),
  inputMode: z.enum(["url-only", "url-plus-repo"]),
  sourceRepo: z.string().optional(),
  initialPageSelection: z.array(z.string().min(1)).default(["all"]),
  maxParallelPages: z.number().int().positive().default(4),
  maxParallelSections: z.number().int().positive().default(4),
}).strict();

export type SiteFrontmatter = z.infer<typeof SiteFrontmatterSchema>;
export type SiteFrontmatterInput = z.input<typeof SiteFrontmatterSchema>;
