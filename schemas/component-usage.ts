import { z } from "zod";

export const ComponentUsageEntrySchema = z.object({
  id: z.string().min(1),
  instances: z.number().int().nonnegative(),
  sectionIndices: z.array(z.number().int().nonnegative()).default([]),
});

export const ComponentUsageSchema = z.object({
  url: z.string().url(),
  slug: z.string().min(1),
  computedAt: z.string().datetime(),
  components: z.array(ComponentUsageEntrySchema),
  unmatchedSectionIndices: z.array(z.number().int().nonnegative()).default([]),
});

export type ComponentUsage = z.infer<typeof ComponentUsageSchema>;
export type ComponentUsageEntry = z.infer<typeof ComponentUsageEntrySchema>;
