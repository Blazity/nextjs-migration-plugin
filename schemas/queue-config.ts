import { z } from "zod";

export const QueueConfigSchema = z.object({
  concurrency: z.number().int().min(1).max(4),
}).strict();

export type QueueConfig = z.infer<typeof QueueConfigSchema>;
