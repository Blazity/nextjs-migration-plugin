import { z } from "zod";

const ArtifactVersionSchema = z.string().regex(/^[0-9a-f]{16}$/);
const NonEmptyStringSchema = z.string().min(1);
const ViewportSchema = z.union([z.literal(390), z.literal(768), z.literal(1440)]);

export const ComponentBatchReportEntrySchema = z.object({
  componentGroupId: NonEmptyStringSchema,
  implementationName: NonEmptyStringSchema,
  kind: z.enum(["shell", "content"]),
  componentPath: NonEmptyStringSchema,
  storyPath: NonEmptyStringSchema,
  verification: z.enum(["PASS", "FAIL", "skipped-by-design"]),
  storybookUrls: z.array(NonEmptyStringSchema),
  referencePaths: z.array(NonEmptyStringSchema),
  diffPaths: z.array(NonEmptyStringSchema),
  failingViewports: z.array(ViewportSchema),
  error: z.string().nullable(),
}).strict();

export const ComponentBatchReportSchema = z.object({
  kind: z.literal("component-batch-report"),
  artifactVersion: ArtifactVersionSchema,
  generatedAt: z.string().datetime(),
  components: z.array(ComponentBatchReportEntrySchema).min(1),
}).strict();

export type ComponentBatchReportEntry = z.infer<typeof ComponentBatchReportEntrySchema>;
export type ComponentBatchReport = z.infer<typeof ComponentBatchReportSchema>;
