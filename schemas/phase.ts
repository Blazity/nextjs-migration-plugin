import { z } from "zod";

export const PhaseVerificationSchema = z.object({
  phase: z.string().min(1),
  passed: z.boolean(),
  checkedAt: z.string().datetime(),
  criteria: z.array(z.object({
    name: z.string(),
    passed: z.boolean(),
    detail: z.string().optional(),
  })).min(1),
  notes: z.string().optional(),
});

export type PhaseVerification = z.infer<typeof PhaseVerificationSchema>;
