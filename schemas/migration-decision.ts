import { z } from "zod";

const ArtifactVersionSchema = z.string().regex(/^[0-9a-f]{16}$/);

export const MigrationDecisionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "inventory-correction",
    "component-inventory-approval",
    "component-batch-approval",
    "page-layout-approval",
  ]),
  actor: z.enum(["user", "llm", "tool"]),
  createdAt: z.string().datetime(),
  summary: z.string().min(1),
  artifactVersion: ArtifactVersionSchema.optional(),
  userFeedback: z.string().optional(),
  userNotes: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
}).strict();

export type MigrationDecision = z.infer<typeof MigrationDecisionSchema>;
