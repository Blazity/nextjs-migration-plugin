import type { LoadResult } from "../schemas/errors.ts";

export class UnrepairableStateError extends Error {
  constructor(public lastResult: Extract<LoadResult<unknown>, { valid: false }>) {
    super(`State at ${lastResult.path} could not be auto-repaired.`);
    this.name = "UnrepairableStateError";
  }
}

export type RepairDispatcher<T> = (
  diagnostic: Extract<LoadResult<T>, { valid: false }>,
) => Promise<void>;

export interface LoadWithRepairArgs<T> {
  path: string;
  load: () => LoadResult<T>;
  dispatch: RepairDispatcher<T>;
  maxAttempts?: number;
}

export async function loadWithRepair<T>(args: LoadWithRepairArgs<T>): Promise<T> {
  const max = args.maxAttempts ?? 3;
  for (let attempt = 0; attempt <= max; attempt++) {
    const result = args.load();
    if (result.valid) return result.data;
    if (attempt === max) throw new UnrepairableStateError(result);
    await args.dispatch(result);
  }
  throw new Error("unreachable");
}
