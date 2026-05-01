import { z } from "zod";

export const PageSpecFilesSchema = z.object({
  styles: z.string(),
  images: z.string(),
  animations: z.string(),
  structure: z.string(),
  globals: z.string(),
});

export const PageSpecStatsSchema = z.object({
  sectionCount: z.number().int().nonnegative(),
  imageCount: z.number().int().nonnegative().default(0),
  animationCount: z.number().int().nonnegative().default(0),
});

export const PageSpecErrorSchema = z.object({
  step: z.enum(["styles", "images", "animations", "structure"]),
  message: z.string(),
});

export const PageSpecManifestSchema = z.object({
  url: z.string().url(),
  slug: z.string().min(1),
  extractedAt: z.string().datetime(),
  viewport: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  files: PageSpecFilesSchema,
  stats: PageSpecStatsSchema,
  errors: z.array(PageSpecErrorSchema).default([]),
});

export type PageSpecManifest = z.infer<typeof PageSpecManifestSchema>;
export type PageSpecFiles = z.infer<typeof PageSpecFilesSchema>;
