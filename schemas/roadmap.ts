import { z } from "zod";

export const RoadmapItemKindSchema = z.enum([
  "layout",
  "component",
  "page",
  "polish",
]);

export const RoadmapItemSchema = z.object({
  kind: RoadmapItemKindSchema,
  id: z.string().min(1),
  name: z.string().min(1),
  dependsOn: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

export const RoadmapSchema = z.object({
  goal: z.enum(["wireframe", "pixel-perfect"]),
  mode: z.enum(["attended", "unattended"]),
  buildOrder: z.array(RoadmapItemSchema).min(1),
  parallelism: z.object({
    maxParallelPages: z.number().int().positive(),
    maxParallelSections: z.number().int().positive(),
  }),
  resolvedQuestions: z.array(z.object({
    question: z.string().min(1),
    answer: z.string().min(1),
  })).default([]),
  generatedAt: z.string().datetime(),
});

export type Roadmap = z.infer<typeof RoadmapSchema>;
export type RoadmapItem = z.infer<typeof RoadmapItemSchema>;
export type RoadmapItemKind = z.infer<typeof RoadmapItemKindSchema>;
