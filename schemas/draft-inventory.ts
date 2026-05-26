import { z } from "zod";

export const DraftInventoryEntrySchema = z.object({
  componentGroupId: z.string().min(1),
  proposedName: z.string().min(1),
  kind: z.enum(["shell", "content"]),
  sectionInstanceIds: z.array(z.string().min(1)).min(1),
  notes: z.string().optional(),
  // `render` emits a real component. `skip` emits a placeholder that
  // exports a null component — used for Webflow plumbing (empty wrappers,
  // CSS hoists, layout-only spacers) that the inventory-decider flagged
  // as do-not-codify. The inventory still tracks them so page-assembly
  // knows to omit them, but they don't pollute the components directory.
  // See docs/issues/004.
  emit: z.enum(["render", "skip"]).optional(),
}).strict();

export const DraftInventorySchema = z.object({
  generatedAt: z.string().datetime(),
  revision: z.number().int().nonnegative(),
  entries: z.array(DraftInventoryEntrySchema),
}).strict();

export type DraftInventoryEntry = z.infer<typeof DraftInventoryEntrySchema>;
export type DraftInventory = z.infer<typeof DraftInventorySchema>;
