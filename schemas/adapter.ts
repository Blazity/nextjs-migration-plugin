import { z } from "zod";

export const DetectionSchema = z.object({
  // Real-world adapters use either an array (e.g. ["Webflow"]) or a single string
  // (e.g. "Astro") for metaGenerator. Accept both.
  metaGenerator: z.union([z.string(), z.array(z.string())]).optional(),
  httpHeaders: z.record(z.string(), z.string()).optional(),
  jsMarkers: z.array(z.string()).optional(),
  domMarkers: z.array(z.string()).optional(),
  urlPatterns: z.array(z.string()).optional(),
  classNamePrefixes: z.array(z.string()).optional(),
  cdnDomains: z.array(z.string()).optional(),
}).passthrough();

// Section discovery: older (plugin-internal) adapter fixtures use `selector`,
// `unwrap`, `minSectionCount`, `maxSectionCount`. Vendored real-world adapters
// use `primarySelector`, `skipSelectors`, `sectionLabelPatterns`, and may set
// `minExpectedSections`, `disableUnwrap`, `notes`. Accept both shapes.
export const SectionDiscoverySchema = z.object({
  selector: z.string().optional(),
  primarySelector: z.string().optional(),
  unwrap: z.boolean().optional(),
  disableUnwrap: z.boolean().optional(),
  minSectionCount: z.number().int().positive().optional(),
  maxSectionCount: z.number().int().positive().optional(),
  minExpectedSections: z.number().int().positive().optional(),
  spaContainerHints: z.array(z.string()).default([]),
  skipSelectors: z.array(z.string()).optional(),
  sectionLabelPatterns: z.array(z.string()).optional(),
  notes: z.string().optional(),
}).passthrough();

// Animation engines observed across 24 vendored adapters include:
// ix2, css-transitions, framer-motion, gsap, none, animate-css,
// squarespace-animation-runtime, svelte-transition, vue-transition,
// waypoints-css. Use an open string rather than a restrictive enum so new
// engines can be added without a schema change.
export const AnimationSchema = z.object({
  engine: z.string(),
  jsGlobal: z.string().nullable().optional(),
  defaultDurationMs: z.number().optional(),
  dataSource: z.string().nullable().optional(),
  transitionProperty: z.string().nullable().optional(),
  notes: z.string().optional(),
}).passthrough();

export const LocalSiteSchema = z.object({
  sectionSelector: z.string().optional(),
  devToolsHideScript: z.string().optional(),
}).passthrough().optional();

export const DynamicElementSchema = z.object({
  selector: z.string(),
  reason: z.string(),
}).passthrough();

// Validation results appear in two shapes across vendored adapters:
//   - array of { url, passed, notes }   (original plugin schema shape)
//   - object { passed: number, failed: number, sections?: (number|null)[] }
//     (shape used by every vendored adapter)
// Both are accepted.
const ValidationResultArrayItem = z.object({
  url: z.string(),
  passed: z.boolean(),
  notes: z.string(),
}).passthrough();

const ValidationResultObject = z.object({
  passed: z.number(),
  failed: z.number(),
  sections: z.array(z.number().nullable()).optional(),
}).passthrough();

export const QuirkSchema = z.object({
  id: z.string(),
  description: z.string(),
  workaround: z.string().optional(),
}).passthrough();

export const AdapterSchema = z.object({
  // Identifier: plugin fixtures use `name`; vendored real-world adapters use
  // `platform`. At least one must be present. Both are allowed.
  name: z.string().min(1).optional(),
  platform: z.string().min(1).optional(),
  type: z.enum(["framework", "cms"]),
  // Vendored adapters use string ("1.0"); the plugin schema historically
  // accepted only string. A few internal configs use numeric versions, so
  // accept both.
  version: z.union([z.string(), z.number()]),
  detection: DetectionSchema,
  sectionDiscovery: SectionDiscoverySchema.optional(),
  styles: z.record(z.string(), z.unknown()).optional(),
  images: z.object({
    cdnPatterns: z.array(z.string()).optional(),
    // Vendored adapters frequently set responsiveFormat to null when the
    // platform has no responsive-image URL template.
    responsiveFormat: z.string().nullable().optional(),
    assetIdPattern: z.string().nullable().optional(),
    lazyLoadStrategy: z.string().optional(),
    notes: z.string().optional(),
  }).passthrough().optional(),
  animations: AnimationSchema.optional(),
  localSite: LocalSiteSchema,
  dynamicElements: z.array(DynamicElementSchema).default([]),
  // Top-level quirks array present on every vendored adapter — documents
  // platform-specific pitfalls/workarounds.
  quirks: z.array(QuirkSchema).optional(),
  validation: z.object({
    lastRun: z.string().optional(),
    lastValidated: z.string().optional(),
    passRate: z.number().min(0).max(1).optional(),
    results: z.union([z.array(ValidationResultArrayItem), ValidationResultObject]).optional(),
    sites: z.array(z.string()).optional(),
  }).passthrough().optional(),
}).passthrough().refine(
  data => Boolean(data.name) || Boolean(data.platform),
  { message: "Adapter must have either 'name' or 'platform'", path: ["name"] },
);

export type Adapter = z.infer<typeof AdapterSchema>;
