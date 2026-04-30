import { loadAdapter } from "./load-adapter.ts";
import type { Adapter } from "../schemas/adapter.ts";
import type { LoadResult } from "../schemas/errors.ts";

export class UnrepairableAdapterError extends Error {
  constructor(public lastResult: Extract<LoadResult<Adapter>, { valid: false }>) {
    super(`Adapter at ${lastResult.path} could not be auto-repaired after 3 attempts.`);
    this.name = "UnrepairableAdapterError";
  }
}

export type RepairDispatcher = (
  diagnostic: Extract<LoadResult<Adapter>, { valid: false }>,
) => Promise<void>;

export async function loadAdapterWithRepair(
  path: string,
  dispatch: RepairDispatcher,
  maxAttempts = 3,
): Promise<Adapter> {
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    const result = loadAdapter(path);
    if (result.valid) return result.data;
    if (attempt === maxAttempts) {
      throw new UnrepairableAdapterError(result);
    }
    await dispatch(result);
  }
  throw new Error("unreachable");
}
