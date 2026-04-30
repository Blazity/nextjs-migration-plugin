import type { z } from "zod";

export type LoadResult<T> =
  | { valid: true; data: T }
  | { valid: false; issues: z.ZodIssue[]; rawJson: unknown; path: string };
