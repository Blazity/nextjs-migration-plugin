import { z } from "zod";

export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

export const SectionSignalsSchema = z.object({
  imgCount: z.enum(["0", "1", "2-4", "5+"]).default("0"),
  videoCount: z.enum(["0", "1+"]).default("0"),
  formCount: z.enum(["0", "1+"]).default("0"),
  buttonCount: z.enum(["0", "1", "2", "3+"]).default("0"),
  headingCount: z.enum(["0", "1", "2-3", "4+"]).default("0"),
  liCount: z.enum(["0", "1-3", "4-10", "11+"]).default("0"),
  textLen: z.enum(["<50", "<200", "<500", "500+"]).default("<50"),
  height: z.enum(["<400", "<800", "<1500", "1500+"]).default("<400"),
});

export const SectionRecordSchema = z.object({
  id: z.string().min(1),
  selector: z.string().min(1),
  tagSkeleton: z.string(),
  pathShingles: z.array(z.string()).default([]),
  sampleText: z.string().default(""),
  boundingBox: BoundingBoxSchema,
  signals: SectionSignalsSchema.optional(),
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
export type SectionSignals = z.infer<typeof SectionSignalsSchema>;
