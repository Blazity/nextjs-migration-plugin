import { z } from "zod";

const TimestampSchema = z.string().datetime();
const ArtifactVersionSchema = z.string().regex(/^[0-9a-f]{16}$/);
const NonEmptyStringSchema = z.string().min(1);

const ApprovalMetadataSchema = {
  approvedAt: TimestampSchema,
  artifactVersion: ArtifactVersionSchema,
  userNotes: z.string().optional(),
  staleSince: TimestampSchema.optional(),
};

export const ComponentInventoryApprovalEntrySchema = z.object({
  componentGroupId: NonEmptyStringSchema,
  implementationName: NonEmptyStringSchema,
}).strict();

export const ComponentInventoryApprovalSchema = z.object({
  kind: z.literal("component-inventory"),
  ...ApprovalMetadataSchema,
  entries: z.array(ComponentInventoryApprovalEntrySchema).min(1),
}).strict();

export const ComponentBatchApprovalSchema = z.object({
  kind: z.literal("component-batch"),
  ...ApprovalMetadataSchema,
  componentGroupIds: z.array(NonEmptyStringSchema).min(1),
  implementationNames: z.array(NonEmptyStringSchema).min(1),
}).strict().superRefine((approval, ctx) => {
  if (approval.componentGroupIds.length !== approval.implementationNames.length) {
    ctx.addIssue({
      code: "custom",
      path: ["implementationNames"],
      message: "componentGroupIds and implementationNames must have the same length",
    });
  }
});

export const PageLayoutApprovalSchema = z.object({
  kind: z.literal("page-layout"),
  ...ApprovalMetadataSchema,
  slug: NonEmptyStringSchema,
  componentGroupIds: z.array(NonEmptyStringSchema).min(1),
  pageReferenceVersion: ArtifactVersionSchema,
}).strict();

export const ApprovalRecordSchema = z.discriminatedUnion("kind", [
  ComponentInventoryApprovalSchema,
  ComponentBatchApprovalSchema,
  PageLayoutApprovalSchema,
]);

export type ComponentInventoryApprovalEntry = z.infer<
  typeof ComponentInventoryApprovalEntrySchema
>;
export type ComponentInventoryApproval = z.infer<
  typeof ComponentInventoryApprovalSchema
>;
export type ComponentBatchApproval = z.infer<typeof ComponentBatchApprovalSchema>;
export type PageLayoutApproval = z.infer<typeof PageLayoutApprovalSchema>;
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;
