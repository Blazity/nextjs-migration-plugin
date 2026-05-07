import { z } from "zod";

const ScreenshotSchema = z.object({
  viewport: z.union([z.literal(390), z.literal(768), z.literal(1440)]),
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export const ApprovedBaselineSchema = z.object({
  approvalRef: z.string().min(1),
  kind: z.enum(["component", "page"]),
  capturedAt: z.string().datetime(),
  regressionThreshold: z.number().gt(0).lte(0.05).default(0.001),
  screenshots: z.array(ScreenshotSchema).min(1),
}).strict();

export type ApprovedBaseline = z.infer<typeof ApprovedBaselineSchema>;
