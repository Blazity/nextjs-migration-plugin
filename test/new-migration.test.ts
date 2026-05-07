import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseNewMigrationArgs, runNewMigration } from "../lib/new-migration.ts";

describe("runNewMigration", () => {
  it("returns the Component Inventory Review outcome from migration start", async () => {
    const target = mkdtempSync(join(tmpdir(), "newmig-"));
    const outcome = await runNewMigration({
      sourceUrl: "https://example.com",
      targetDir: target,
      inputMode: "url-only",
      migrationStartRunner: async () => ({
        kind: "ready-for-review",
        targetDir: target,
        draftInventoryPath: join(target, ".migration/inventory/component-inventory.json"),
        reviewHtmlPath: join(target, ".migration/inventory/inventory-review.html"),
        artifactVersion: "0123456789abcdef",
      }),
    });

    expect(outcome).toEqual({
      kind: "ready-for-review",
      targetDir: target,
      draftInventoryPath: join(target, ".migration/inventory/component-inventory.json"),
      reviewHtmlPath: join(target, ".migration/inventory/inventory-review.html"),
      artifactVersion: "0123456789abcdef",
    });
  });

  it("passes intake answers to migration start", async () => {
    const target = mkdtempSync(join(tmpdir(), "newmig-"));
    const calls: unknown[] = [];
    await runNewMigration({
      sourceUrl: "https://example.com",
      targetDir: target,
      inputMode: "url-plus-repo",
      sourceRepo: "/tmp/source-repo",
      initialPageSelection: ["/", "/about"],
      migrationStartRunner: async (args) => {
        calls.push(args);
        return {
          kind: "ready-for-review",
          targetDir: target,
          draftInventoryPath: "draft.json",
          reviewHtmlPath: "review.html",
          artifactVersion: "0123456789abcdef",
        };
      },
    });

    expect(calls).toEqual([{
      sourceUrl: "https://example.com",
      targetDir: target,
      inputMode: "url-plus-repo",
      sourceRepo: "/tmp/source-repo",
      initialPageSelection: ["/", "/about"],
    }]);
  });

  it("rejects when targetDir already has .migration/", async () => {
    const target = mkdtempSync(join(tmpdir(), "newmig-"));
    writeFileSync(join(target, "package.json"), JSON.stringify({ name: "target", scripts: {} }, null, 2));
    await runNewMigration({
      sourceUrl: "https://example.com",
      targetDir: target,
      inputMode: "url-only",
      migrationStartRunner: async (args) => {
        const { runMigrationStart } = await import("../lib/migration-start.ts");
        return runMigrationStart({
          ...args,
          discoveryRunner: async () => ({
            rawDiscoveryPath: join(target, ".migration/discovery/sections.json"),
            evidence: {
              probedAt: "2026-05-07T12:00:00.000Z",
              pages: [{
                url: "https://example.com/",
                sections: [{
                  id: "hero",
                  selector: "main > section",
                  tagSkeleton: "section>h1",
                  pathShingles: ["body>main>section"],
                  sampleText: "Hero",
                  boundingBox: { x: 0, y: 0, width: 100, height: 100 },
                }],
              }],
              referenceScreenshots: {
                components: [],
                pages: [],
              },
              source: {
                sourceUrl: "https://example.com",
                capturedAt: "2026-05-07T12:00:00.000Z",
              },
            },
          }),
          generatedAt: () => "2026-05-07T12:00:00.000Z",
        });
      },
    });
    await expect(runNewMigration({
      sourceUrl: "https://example.com",
      targetDir: target,
      inputMode: "url-only",
      migrationStartRunner: async (args) => {
        const { runMigrationStart } = await import("../lib/migration-start.ts");
        return runMigrationStart(args);
      },
    })).rejects.toThrow();
    expect(existsSync(join(target, "SESSION-LOG.md"))).toBe(false);
  });
});

describe("parseNewMigrationArgs", () => {
  it("ignores --mode and --goal flags if passed (no-op, deprecated)", () => {
    const args = parseNewMigrationArgs([
      "--url",
      "https://example.com",
      "--mode",
      "unattended",
      "--goal",
      "wireframe",
    ]);

    expect(args).not.toHaveProperty("mode");
    expect(args).not.toHaveProperty("goal");
  });
});
