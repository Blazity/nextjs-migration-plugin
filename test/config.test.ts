import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALLOWED_KEYS, NUMERIC_KEYS, setConfig } from "../lib/config.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";
import { SiteFrontmatterSchema } from "../schemas/site.ts";

const baseSite = {
  sourceUrl: "https://example.com",
  target: "./",
  inputMode: "url-only" as const,
  maxParallelPages: 4,
  maxParallelSections: 4,
};

describe("setConfig", () => {
  it("rejects removed legacy mode and goal keys", async () => {
    const target = mkdtempSync(join(tmpdir(), "config-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    await expect(setConfig(target, "mode", "unattended")).rejects.toThrow(/unknown config key/i);
    await expect(setConfig(target, "goal", "pixel-perfect")).rejects.toThrow(/unknown config key/i);
  });

  it("rejects invalid key", async () => {
    const target = mkdtempSync(join(tmpdir(), "config-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    await expect(setConfig(target, "notAKey", "whatever")).rejects.toThrow(/unknown config key/i);
  });

  it("rejects invalid value for enum key", async () => {
    const target = mkdtempSync(join(tmpdir(), "config-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    await expect(setConfig(target, "inputMode", "bogus")).rejects.toThrow();
  });

  it("coerces numeric values for parallelism keys", async () => {
    const target = mkdtempSync(join(tmpdir(), "config-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    await setConfig(target, "maxParallelPages", "8");
    const site = readFileSync(join(target, ".migration/SITE.md"), "utf8");
    expect(site).toContain("maxParallelPages: 8");
  });

  it("parses comma-separated initialPageSelection values", async () => {
    const target = mkdtempSync(join(tmpdir(), "config-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    await setConfig(target, "initialPageSelection", "/,/about");
    const site = readFileSync(join(target, ".migration/SITE.md"), "utf8");
    expect(site).toContain('initialPageSelection: ["/","/about"]');
  });
});

describe("config key sets", () => {
  const schemaKeys = Object.keys(SiteFrontmatterSchema.shape);
  const LOCKED = new Set(["sourceUrl", "target"]);

  it("ALLOWED_KEYS equals schema keys minus locked identity fields", () => {
    const expected = new Set(schemaKeys.filter(k => !LOCKED.has(k)));
    expect(ALLOWED_KEYS).toEqual(expected);
  });

  it("every NUMERIC_KEYS entry is a schema field", () => {
    for (const key of NUMERIC_KEYS) {
      expect(schemaKeys).toContain(key);
    }
  });

  it("every NUMERIC_KEYS entry coerces a numeric string to a number in the schema", () => {
    const baseInput = {
      sourceUrl: "https://example.com",
      target: "./",
      inputMode: "url-only" as const,
    };
    for (const key of NUMERIC_KEYS) {
      const parsed = SiteFrontmatterSchema.safeParse({ ...baseInput, [key]: 7 });
      expect(parsed.success, `${key} should accept a number`).toBe(true);
      if (parsed.success) {
        expect((parsed.data as Record<string, unknown>)[key]).toBe(7);
      }
    }
  });
});
