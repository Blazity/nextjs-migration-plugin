import { z } from "zod";

export const BuildComponentEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  filePath: z.string().min(1),
  memberCount: z.number().int().nonnegative(),
});

export const BuildPageEntrySchema = z.object({
  sourceUrl: z.string().url(),
  nextRoute: z.string().min(1),
  filePath: z.string().min(1),
});

export const BuildAssetEntrySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

export const BuildManifestSchema = z.object({
  generatedAt: z.string().datetime(),
  components: z.array(BuildComponentEntrySchema),
  pages: z.array(BuildPageEntrySchema),
  assets: z.array(BuildAssetEntrySchema),
});

export type BuildManifest = z.infer<typeof BuildManifestSchema>;
