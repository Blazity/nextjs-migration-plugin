import { z } from "zod";

export const LayoutShellSchema = z.object({
  id: z.string().min(1),
  signature: z.string().min(1),
  appearsOn: z.array(z.string().url()).min(1),
  tagSkeleton: z.string(),
});

export const LayoutsSchema = z.object({
  header: LayoutShellSchema.nullable(),
  footer: LayoutShellSchema.nullable(),
  nav: LayoutShellSchema.nullable(),
  updatedAt: z.string().datetime(),
});

export type Layouts = z.infer<typeof LayoutsSchema>;
export type LayoutShell = z.infer<typeof LayoutShellSchema>;
