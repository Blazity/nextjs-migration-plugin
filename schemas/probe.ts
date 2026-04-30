import { z } from "zod";

export const ProbeRecommendation = z.enum([
  "DIRECT_EXTRACTION",
  "SPA_FLOW_EXTRACTION",
  "ABORT_NO_ADAPTER",
]);

export const ProbedPageSchema = z.object({
  url: z.string().url(),
  matchedAdapters: z.array(z.string()).default([]),
  recommendation: ProbeRecommendation,
  detectedCMP: z.string().nullable().default(null),
  isSPA: z.boolean(),
});

export const ProbeSchema = z.object({
  probedAt: z.string().datetime(),
  pages: z.array(ProbedPageSchema).min(1),
});

export type Probe = z.infer<typeof ProbeSchema>;
export type ProbedPage = z.infer<typeof ProbedPageSchema>;
