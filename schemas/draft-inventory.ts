import { z } from "zod";

export const DraftInventoryEntrySchema = z.object({
  componentGroupId: z.string().min(1),
  proposedName: z.string().min(1),
  kind: z.enum(["shell", "content"]),
  sectionInstanceIds: z.array(z.string().min(1)).min(1),
  notes: z.string().optional(),
}).strict();

export const DraftInventorySchema = z.object({
  generatedAt: z.string().datetime(),
  revision: z.number().int().nonnegative(),
  entries: z.array(DraftInventoryEntrySchema),
}).strict();

export type DraftInventoryEntry = z.infer<typeof DraftInventoryEntrySchema>;
export type DraftInventory = z.infer<typeof DraftInventorySchema>;
