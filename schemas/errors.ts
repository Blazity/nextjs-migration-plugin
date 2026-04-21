import type { z } from "zod";

export type LoadResult<T> =
  | { valid: true; adapter: T }
  | { valid: false; issues: z.ZodIssue[]; rawJson: unknown; path: string };
