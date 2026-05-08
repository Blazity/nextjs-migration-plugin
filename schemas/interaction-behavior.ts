import { z } from "zod";

export const InteractionClassSchema = z.enum([
  "static",
  "css-state",
  "client-state",
  "form-integration",
  "motion",
]);

export const InteractionBehaviorStatusSchema = z.enum([
  "not-required",
  "verified",
  "unresolved",
]);

export const InteractionBehaviorSchema = z.object({
  class: InteractionClassSchema,
  status: InteractionBehaviorStatusSchema,
  evidence: z.array(z.string()),
  requiredChecks: z.array(z.string()),
  verifiedChecks: z.array(z.string()),
  unresolvedBehavior: z.array(z.string()),
}).strict();

export type InteractionClass = z.infer<typeof InteractionClassSchema>;
export type InteractionBehavior = z.infer<typeof InteractionBehaviorSchema>;
