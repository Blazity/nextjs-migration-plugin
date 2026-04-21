import { describe, it, expect, vi } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAdapterWithRepair, UnrepairableAdapterError } from "../lib/load-adapter-with-repair.ts";

function tempAdapterFile(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "repair-test-"));
  const path = join(dir, "adapter.json");
  writeFileSync(path, contents);
  return path;
}

describe("loadAdapterWithRepair", () => {
  it("returns adapter on first call when already valid", async () => {
    const path = tempAdapterFile(JSON.stringify({
      name: "x", type: "framework", version: "1",
      detection: {},
    }));
    const dispatch = vi.fn();
    const adapter = await loadAdapterWithRepair(path, dispatch);
    expect(adapter.name).toBe("x");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches repairer when invalid, then succeeds after repair", async () => {
    const path = tempAdapterFile(JSON.stringify({ name: "x" }));
    const dispatch = vi.fn().mockImplementation(async () => {
      writeFileSync(path, JSON.stringify({
        name: "x", type: "framework", version: "1", detection: {},
      }));
    });
    const adapter = await loadAdapterWithRepair(path, dispatch);
    expect(adapter.name).toBe("x");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("throws UnrepairableAdapterError after 3 failed repair attempts", async () => {
    const path = tempAdapterFile(JSON.stringify({ name: "x" }));
    const dispatch = vi.fn().mockImplementation(async () => {
      // no-op repair — file stays broken
    });
    await expect(loadAdapterWithRepair(path, dispatch)).rejects.toBeInstanceOf(UnrepairableAdapterError);
    expect(dispatch).toHaveBeenCalledTimes(3);
  });
});
