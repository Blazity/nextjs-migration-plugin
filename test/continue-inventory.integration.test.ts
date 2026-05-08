import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrationStart } from "../lib/migration-start.ts";
import { resumeMigration } from "../lib/continue.ts";

describe("continue inventory review", () => {
  it("resumes a newly started migration at Component Inventory Review", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "cont-inventory-"));
    writeFileSync(join(targetDir, "package.json"), JSON.stringify({ scripts: {} }, null, 2));

    const started = await runMigrationStart({
      sourceUrl: "https://example.com/",
      targetDir,
      inputMode: "url-only",
      discoveryRunner: async () => ({
        rawDiscoveryPath: ".migration/discovery/sections.json",
        evidence: {
          probedAt: "2026-05-07T12:00:00.000Z",
          pages: [
            {
              url: "https://example.com/",
              sections: [
                {
                  id: "header",
                  selector: "header",
                  tagSkeleton: "header>nav",
                  pathShingles: [],
                  sampleText: "Navigation",
                  boundingBox: { x: 0, y: 0, width: 1440, height: 80 },
                },
                {
                  id: "hero",
                  selector: "main > section",
                  tagSkeleton: "section>h1",
                  pathShingles: [],
                  sampleText: "Hero",
                  boundingBox: { x: 0, y: 80, width: 1440, height: 500 },
                },
              ],
            },
          ],
          referenceScreenshots: {
            components: [],
            pages: [],
          },
          source: {
            sourceUrl: "https://example.com/",
            capturedAt: "2026-05-07T12:00:00.000Z",
          },
        },
      }),
      generatedAt: () => "2026-05-07T12:00:00.000Z",
    });

    const result = await resumeMigration(targetDir, {});

    expect(started.kind).toBe("ready-for-review");
    expect(result.kind).toBe("awaiting-approval");
    if (result.kind === "awaiting-approval") {
      expect(result.approval).toBe("component-inventory");
      expect(result.reviewHtmlPath).toBe(started.reviewHtmlPath);
      expect(result.artifactVersion).toBe(started.artifactVersion);
    }
  });
});
