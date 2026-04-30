import { describe, it, expect, vi } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { loadWithRepair, UnrepairableStateError } from "../lib/load-with-repair.ts";
import type { LoadResult } from "../schemas/errors.ts";

const Schema = z.object({ name: z.string(), count: z.number() });
type T = z.infer<typeof Schema>;

function tempFile(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "load-repair-"));
  const path = join(dir, "data.json");
  writeFileSync(path, contents);
  return path;
}

function loaderFor(path: string): LoadResult<T> {
  const { readFileSync } = require("node:fs");
  let rawJson: unknown;
  try { rawJson = JSON.parse(readFileSync(path, "utf8")); }
  catch (err) {
    return { valid: false, path, rawJson: null,
      issues: [{ code: "custom", path: [], message: String(err) }] };
  }
  const r = Schema.safeParse(rawJson);
  return r.success
    ? { valid: true, data: r.data }
    : { valid: false, path, rawJson, issues: r.error.issues };
}

describe("loadWithRepair", () => {
  it("returns data on first valid load — no dispatch", async () => {
    const path = tempFile(JSON.stringify({ name: "ok", count: 1 }));
    const dispatch = vi.fn();
    const data = await loadWithRepair({ path, load: () => loaderFor(path), dispatch });
    expect(data.name).toBe("ok");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches up to maxAttempts and returns data after a successful repair", async () => {
    const path = tempFile(JSON.stringify({ name: "missing-count" }));
    const dispatch = vi.fn().mockImplementation(async () => {
      writeFileSync(path, JSON.stringify({ name: "fixed", count: 9 }));
    });
    const data = await loadWithRepair({ path, load: () => loaderFor(path), dispatch });
    expect(data.name).toBe("fixed");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("throws UnrepairableStateError after maxAttempts (default 3)", async () => {
    const path = tempFile(JSON.stringify({}));
    const dispatch = vi.fn().mockImplementation(async () => { /* no-op */ });
    await expect(
      loadWithRepair({ path, load: () => loaderFor(path), dispatch })
    ).rejects.toBeInstanceOf(UnrepairableStateError);
    expect(dispatch).toHaveBeenCalledTimes(3);
  });

  it("respects a custom maxAttempts of 1", async () => {
    const path = tempFile(JSON.stringify({}));
    const dispatch = vi.fn().mockImplementation(async () => { /* no-op */ });
    await expect(
      loadWithRepair({ path, load: () => loaderFor(path), dispatch, maxAttempts: 1 })
    ).rejects.toBeInstanceOf(UnrepairableStateError);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
