import { z } from "zod";

export const DetectionSchema = z.object({
  metaGenerator: z.array(z.string()).optional(),
  httpHeaders: z.record(z.string(), z.string()).optional(),
  jsMarkers: z.array(z.string()).optional(),
  domMarkers: z.array(z.string()).optional(),
  urlPatterns: z.array(z.string()).optional(),
  classNamePrefixes: z.array(z.string()).optional(),
  cdnDomains: z.array(z.string()).optional(),
});

export const SectionDiscoverySchema = z.object({
  selector: z.string(),
  unwrap: z.boolean().default(false),
  minSectionCount: z.number().int().positive().default(3),
  maxSectionCount: z.number().int().positive().default(30),
  spaContainerHints: z.array(z.string()).default([]),
});

export const AnimationSchema = z.object({
  engine: z.enum(["ix2", "css-transitions", "framer-motion", "gsap", "none"]),
  jsGlobal: z.string().optional(),
  defaultDurationMs: z.number().optional(),
});

export const LocalSiteSchema = z.object({
  sectionSelector: z.string().optional(),
  devToolsHideScript: z.string().optional(),
}).optional();

export const DynamicElementSchema = z.object({
  selector: z.string(),
  reason: z.string(),
});

export const ValidationResultSchema = z.object({
  url: z.string(),
  passed: z.boolean(),
  notes: z.string(),
});

export const AdapterSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["framework", "cms"]),
  version: z.string(),
  detection: DetectionSchema,
  sectionDiscovery: SectionDiscoverySchema.optional(),
  styles: z.record(z.string(), z.unknown()).optional(),
  images: z.object({
    cdnPatterns: z.array(z.string()).optional(),
    responsiveFormat: z.string().optional(),
  }).optional(),
  animations: AnimationSchema.optional(),
  localSite: LocalSiteSchema,
  dynamicElements: z.array(DynamicElementSchema).default([]),
  validation: z.object({
    lastRun: z.string().optional(),
    passRate: z.number().min(0).max(1).optional(),
    results: z.array(ValidationResultSchema).optional(),
  }).optional(),
});

export type Adapter = z.infer<typeof AdapterSchema>;
