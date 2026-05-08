import { z } from "zod";

const CssValueMapSchema = z.record(z.string(), z.string());

export const GlobalFoundationSchema = z.object({
  body: CssValueMapSchema.optional(),
  colors: CssValueMapSchema.optional(),
  radii: CssValueMapSchema.optional(),
  spacing: CssValueMapSchema.optional(),
  fonts: CssValueMapSchema.optional(),
  container: CssValueMapSchema.optional(),
  sectionPadding: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  spacers: CssValueMapSchema.optional(),
  resets: CssValueMapSchema.optional(),
}).passthrough();

export type GlobalFoundation = z.infer<typeof GlobalFoundationSchema>;
