import { z } from "zod";

const ArtifactVersionSchema = z.string().regex(/^[0-9a-f]{16}$/);
const NonEmptyStringSchema = z.string().min(1);
const ViewportSchema = z.union([z.literal(390), z.literal(768), z.literal(1440)]);

export const PageAssemblyViewportResultSchema = z.object({
  viewport: ViewportSchema,
  status: z.enum(["PASS", "FAIL", "SUSPICIOUS_ZERO_DIFF"]),
  ratio: z.number().min(0),
  similarity: z.number().min(0).max(1),
  pixelDiffRatio: z.number().min(0),
  bestOffset: z.object({
    x: z.number(),
    y: z.number(),
  }).strict(),
  referencePath: NonEmptyStringSchema,
  screenshotPath: NonEmptyStringSchema,
  diffPath: NonEmptyStringSchema.optional(),
  diagnostics: z.array(z.string()),
}).strict();

export const PageAssemblyReportSchema = z.object({
  kind: z.literal("page-assembly-report"),
  slug: NonEmptyStringSchema,
  artifactVersion: ArtifactVersionSchema,
  pageReferenceVersion: ArtifactVersionSchema,
  generatedAt: z.string().datetime(),
  componentGroupIds: z.array(NonEmptyStringSchema).min(1),
  pagePath: NonEmptyStringSchema,
  build: z.object({
    exitCode: z.union([z.literal(0), z.literal(1)]),
    stdout: z.string(),
    stderr: z.string(),
    packageManager: z.enum(["pnpm", "yarn", "npm"]),
  }).strict(),
  verification: z.enum(["PASS", "FAIL"]),
  referencePaths: z.array(NonEmptyStringSchema),
  screenshotPaths: z.array(NonEmptyStringSchema),
  diffPaths: z.array(NonEmptyStringSchema),
  failingViewports: z.array(ViewportSchema),
  error: z.string().nullable(),
  results: z.array(PageAssemblyViewportResultSchema),
}).strict();

export type PageAssemblyViewportResult = z.infer<typeof PageAssemblyViewportResultSchema>;
export type PageAssemblyReport = z.infer<typeof PageAssemblyReportSchema>;
