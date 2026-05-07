import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadQueueConfig, setQueueConcurrency } from "../lib/queue-config.ts";
import { migrationPaths } from "../lib/migration-paths.ts";

describe("queue config", () => {
  it("defaults browser concurrency to 1", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "queue-config-"));

    expect(loadQueueConfig(targetDir)).toEqual({ concurrency: 1 });
  });

  it("persists valid browser concurrency", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "queue-config-"));

    setQueueConcurrency(targetDir, 2);

    expect(loadQueueConfig(targetDir)).toEqual({ concurrency: 2 });
    expect(JSON.parse(readFileSync(migrationPaths(targetDir).queueConfig, "utf8"))).toEqual({
      concurrency: 2,
    });
  });

  it("rejects browser concurrency outside 1 to 4", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "queue-config-"));

    expect(() => setQueueConcurrency(targetDir, 0)).toThrow("Browser work concurrency must be between 1 and 4");
    expect(() => setQueueConcurrency(targetDir, 5)).toThrow("Browser work concurrency must be between 1 and 4");
  });
});
