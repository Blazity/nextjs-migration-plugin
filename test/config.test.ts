import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setConfig } from "../lib/config.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";

const baseSite = {
  sourceUrl: "https://example.com",
  target: "./",
  mode: "attended" as const,
  goal: "pixel-perfect" as const,
  inputMode: "url-only" as const,
  maxParallelPages: 4,
  maxParallelSections: 4,
};

describe("setConfig", () => {
  it("updates mode from attended to unattended", async () => {
    const target = mkdtempSync(join(tmpdir(), "config-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    await setConfig(target, "mode", "unattended");
    const site = readFileSync(join(target, ".migration/SITE.md"), "utf8");
    expect(site).toContain("mode: unattended");
    expect(site).not.toContain("mode: attended");
  });

  it("rejects invalid key", async () => {
    const target = mkdtempSync(join(tmpdir(), "config-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    await expect(setConfig(target, "notAKey", "whatever")).rejects.toThrow(/unknown config key/i);
  });

  it("rejects invalid value for enum key", async () => {
    const target = mkdtempSync(join(tmpdir(), "config-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    await expect(setConfig(target, "mode", "bogus")).rejects.toThrow();
  });

  it("coerces numeric values for parallelism keys", async () => {
    const target = mkdtempSync(join(tmpdir(), "config-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    await setConfig(target, "maxParallelPages", "8");
    const site = readFileSync(join(target, ".migration/SITE.md"), "utf8");
    expect(site).toContain("maxParallelPages: 8");
  });
});
