import { z } from "zod";

const CssValueMapSchema = z.record(z.string(), z.string());

const FontFaceSchema = z.object({
  family: z.string().min(1),
  src: z.string().min(1),
  weight: z.string().optional(),
  style: z.string().optional(),
  display: z.string().optional(),
  unicodeRange: z.string().optional(),
});

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
  // Heading-element computed typography. Keys are element tags (`h1`, `h2`,
  // …). Values mirror `body` shape; only fontFamily / fontWeight /
  // letterSpacing need to round-trip into the foundation. See docs/issues/007.
  headings: z.record(z.string(), CssValueMapSchema).optional(),
  // Custom `@font-face` declarations harvested from source stylesheets so
  // self-hosted fonts load in Storybook + Next dev. See docs/issues/007.
  fontFaces: z.array(FontFaceSchema).optional(),
}).passthrough();

export type GlobalFoundation = z.infer<typeof GlobalFoundationSchema>;
export type FontFace = z.infer<typeof FontFaceSchema>;
