import { z } from "zod";

export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

export const SectionRecordSchema = z.object({
  id: z.string().min(1),
  selector: z.string().min(1),
  tagSkeleton: z.string(),
  pathShingles: z.array(z.string()).default([]),
  sampleText: z.string().default(""),
  boundingBox: BoundingBoxSchema,
});

export const PageSectionsSchema = z.object({
  url: z.string().url(),
  sections: z.array(SectionRecordSchema),
});

export const DiscoveredSectionsSchema = z.object({
  probedAt: z.string().datetime(),
  pages: z.array(PageSectionsSchema).min(1),
});

export type DiscoveredSections = z.infer<typeof DiscoveredSectionsSchema>;
export type PageSections = z.infer<typeof PageSectionsSchema>;
export type SectionRecord = z.infer<typeof SectionRecordSchema>;
