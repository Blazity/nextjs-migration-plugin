import { z } from "zod";

export const RouteEntrySchema = z.object({
  sourceUrl: z.string().url(),
  nextRoute: z.string().min(1),
  params: z.record(z.string(), z.string()).default({}),
  kind: z.enum(["static", "dynamic"]),
});

export const RoutesSchema = z.object({
  routes: z.array(RouteEntrySchema).min(1),
  updatedAt: z.string().datetime(),
});

export type Routes = z.infer<typeof RoutesSchema>;
export type RouteEntry = z.infer<typeof RouteEntrySchema>;
