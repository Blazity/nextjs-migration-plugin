import { z } from "zod";
import { DraftInventoryEntrySchema } from "./draft-inventory.ts";

export const ApprovedInventoryEntrySchema = DraftInventoryEntrySchema.extend({
  implementationName: z
    .string()
    .regex(/^[A-Z][A-Za-z0-9]*$/)
    .refine(
      name =>
        !/^Component\d+$/.test(name) &&
        !/^UnnamedGroup\d+$/.test(name) &&
        !/p\d+-s\d+/i.test(name) &&
        !/^P\d+S\d+$/.test(name) &&
        !/^Section\d+$/.test(name),
      "implementation name must be semantic, not generic or ID-like"
    ),
  filePath: z.string().regex(/^src\/components\/[A-Z][A-Za-z0-9]*\.tsx$/),
}).superRefine((entry, ctx) => {
  const expectedFilePath = `src/components/${entry.implementationName}.tsx`;
  if (entry.filePath !== expectedFilePath) {
    ctx.addIssue({
      code: "custom",
      path: ["filePath"],
      message: `filePath must match implementationName (${expectedFilePath})`,
    });
  }
});

export const ApprovedInventorySchema = z.object({
  approvedAt: z.string().datetime(),
  artifactVersion: z.string().regex(/^[0-9a-f]{16}$/),
  userNotes: z.string().optional(),
  staleSince: z.string().datetime().optional(),
  entries: z.array(ApprovedInventoryEntrySchema),
}).strict();

export type ApprovedInventoryEntry = z.infer<typeof ApprovedInventoryEntrySchema>;
export type ApprovedInventory = z.infer<typeof ApprovedInventorySchema>;
