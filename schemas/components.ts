import { z } from "zod";

export const ComponentMemberSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
});

export const ComponentEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  signature: z.string().min(1),
  tagSkeleton: z.string(),
  memberSections: z.array(ComponentMemberSchema).min(1),
  unique: z.boolean(),
  propsRef: z.string().nullable(),
});

export const ComponentsSchema = z.object({
  components: z.array(ComponentEntrySchema),
  updatedAt: z.string().datetime(),
});

export type Components = z.infer<typeof ComponentsSchema>;
export type ComponentEntry = z.infer<typeof ComponentEntrySchema>;
