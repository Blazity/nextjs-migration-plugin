import { loadAdapter } from "./load-adapter.ts";
import { loadWithRepair, UnrepairableStateError, type RepairDispatcher } from "./load-with-repair.ts";
import type { Adapter } from "../schemas/adapter.ts";

export { UnrepairableStateError };
export class UnrepairableAdapterError extends UnrepairableStateError {
  constructor(lastResult: ConstructorParameters<typeof UnrepairableStateError>[0]) {
    super(lastResult);
    this.name = "UnrepairableAdapterError";
    this.message = `Adapter at ${lastResult.path} could not be auto-repaired after 3 attempts.`;
  }
}

export type { RepairDispatcher };

export async function loadAdapterWithRepair(
  path: string,
  dispatch: RepairDispatcher<Adapter>,
  maxAttempts = 3,
): Promise<Adapter> {
  try {
    return await loadWithRepair<Adapter>({
      path,
      load: () => loadAdapter(path),
      dispatch,
      maxAttempts,
    });
  } catch (err) {
    if (err instanceof UnrepairableStateError && !(err instanceof UnrepairableAdapterError)) {
      throw new UnrepairableAdapterError(err.lastResult as never);
    }
    throw err;
  }
}
