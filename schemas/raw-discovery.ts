import { z } from "zod";
import { PageSectionsSchema } from "./sections.ts";

const ReferenceViewportSchema = z.union([z.literal(390), z.literal(768), z.literal(1440)]);

const RawDiscoveryPagesSchema = z.array(PageSectionsSchema).superRefine((pages, ctx) => {
  for (const [pageIndex, page] of pages.entries()) {
    if (page.sections.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: [pageIndex, "sections"],
        message: "sections must contain at least one section",
      });
    }
  }
});

export const ComponentReferenceSchema = z.object({
  sectionInstanceId: z.string().min(1),
  url: z.string().url(),
  viewport: ReferenceViewportSchema,
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{16,64}$/),
}).strict();

export const PageReferenceSchema = z.object({
  slug: z.string().min(1),
  url: z.string().url(),
  viewport: ReferenceViewportSchema,
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{16,64}$/),
}).strict();

export const RawDiscoveryEvidenceSchema = z.object({
  probedAt: z.string().datetime(),
  pages: RawDiscoveryPagesSchema,
  referenceScreenshots: z.object({
    components: z.array(ComponentReferenceSchema),
    pages: z.array(PageReferenceSchema),
  }),
  source: z.object({
    sourceUrl: z.string().url(),
    capturedAt: z.string().datetime(),
  }),
}).strict();

export type ComponentReference = z.infer<typeof ComponentReferenceSchema>;
export type PageReference = z.infer<typeof PageReferenceSchema>;
export type RawDiscoveryEvidence = z.infer<typeof RawDiscoveryEvidenceSchema>;
