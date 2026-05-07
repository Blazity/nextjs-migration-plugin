import { z } from "zod";

const ComponentKindSchema = z.enum(["shell", "content"]);

export const RenameInventoryCorrectionSchema = z.object({
  type: z.literal("rename"),
  componentGroupId: z.string().min(1),
  newName: z.string().min(1),
}).strict();

export const MergeInventoryCorrectionSchema = z.object({
  type: z.literal("merge"),
  targetGroupId: z.string().min(1),
  sourceGroupIds: z.array(z.string().min(1)).min(1),
}).strict();

export const SplitInventoryCorrectionSchema = z.object({
  type: z.literal("split"),
  sourceGroupId: z.string().min(1),
  sectionInstanceIds: z.array(z.string().min(1)).min(1),
  newGroupName: z.string().min(1),
  newKind: ComponentKindSchema.optional(),
}).strict();

export const SetKindInventoryCorrectionSchema = z.object({
  type: z.literal("set-kind"),
  componentGroupId: z.string().min(1),
  kind: ComponentKindSchema,
}).strict();

export const NoteInventoryCorrectionSchema = z.object({
  type: z.literal("note"),
  componentGroupId: z.string().min(1),
  note: z.string().min(1),
}).strict();

export const InventoryCorrectionSchema = z.discriminatedUnion("type", [
  RenameInventoryCorrectionSchema,
  MergeInventoryCorrectionSchema,
  SplitInventoryCorrectionSchema,
  SetKindInventoryCorrectionSchema,
  NoteInventoryCorrectionSchema,
]);

export type RenameInventoryCorrection = z.infer<typeof RenameInventoryCorrectionSchema>;
export type MergeInventoryCorrection = z.infer<typeof MergeInventoryCorrectionSchema>;
export type SplitInventoryCorrection = z.infer<typeof SplitInventoryCorrectionSchema>;
export type SetKindInventoryCorrection = z.infer<typeof SetKindInventoryCorrectionSchema>;
export type NoteInventoryCorrection = z.infer<typeof NoteInventoryCorrectionSchema>;
export type InventoryCorrection = z.infer<typeof InventoryCorrectionSchema>;
