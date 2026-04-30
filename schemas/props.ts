import { z } from "zod";

export const PropFieldSchema = z.object({
  name: z.string().min(1),
  tsType: z.string().min(1),
  required: z.boolean(),
});

export const PropInterfaceSchema = z.object({
  name: z.string().min(1),
  fields: z.array(PropFieldSchema),
});

export const PropsRegistrySchema = z.object({
  interfaces: z.array(PropInterfaceSchema),
  updatedAt: z.string().datetime(),
});

export type PropsRegistry = z.infer<typeof PropsRegistrySchema>;
export type PropInterface = z.infer<typeof PropInterfaceSchema>;
