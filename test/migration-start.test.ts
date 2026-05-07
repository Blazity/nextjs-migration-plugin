import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrationStart } from "../lib/migration-start.ts";
import { hashArtifact } from "../lib/artifact-hash.ts";
import { migrationPaths } from "../lib/migration-paths.ts";
import type { RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";

const capturedAt = "2026-05-07T12:00:00.000Z";

const rawEvidence: RawDiscoveryEvidence = {
  probedAt: capturedAt,
  pages: [
    {
      url: "https://example.com/",
      sections: [
        {
          id: "source-hero",
          selector: "main > section",
          tagSkeleton: "section>div>h1,p",
          pathShingles: ["body>main>section", "main>section>div"],
          sampleText: "Hero",
          boundingBox: { x: 0, y: 0, width: 1440, height: 420 },
        },
      ],
    },
  ],
  referenceScreenshots: {
    components: [
      {
        sectionInstanceId: "p0-s0",
        url: "https://example.com/",
        viewport: 1440,
        path: "references/components/p0-s0-1440.png",
        sha256: "0".repeat(64),
      },
    ],
    pages: [
      {
        slug: "home",
        url: "https://example.com/",
        viewport: 1440,
        path: "references/pages/home-1440.png",
        sha256: "1".repeat(64),
      },
    ],
  },
  source: {
    sourceUrl: "https://example.com/",
    capturedAt,
  },
};

describe("runMigrationStart", () => {
  it("bootstraps, discovers, writes draft inventory, scaffolds Storybook, and stops at review", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "migration-start-"));
    writeFileSync(join(targetDir, "package.json"), JSON.stringify({ name: "target", scripts: {} }, null, 2));

    const outcome = await runMigrationStart({
      targetDir,
      sourceUrl: "https://example.com/",
      inputMode: "url-only",
      discoveryRunner: async () => ({
        rawDiscoveryPath: migrationPaths(targetDir).rawDiscovery,
        evidence: rawEvidence,
      }),
      generatedAt: () => capturedAt,
    });

    const paths = migrationPaths(targetDir);
    expect(existsSync(join(targetDir, ".migration/SITE.md"))).toBe(true);
    expect(existsSync(paths.draftInventory)).toBe(true);
    expect(existsSync(paths.reviewHtml)).toBe(true);
    expect(existsSync(join(targetDir, ".storybook/main.ts"))).toBe(true);
    expect(existsSync(paths.approvedInventory)).toBe(false);
    expect(existsSync(join(targetDir, ".migration/runs/001-initial/phase-1-discover"))).toBe(false);
    expect(existsSync(join(targetDir, "storybook-static"))).toBe(false);

    const draftInventory = JSON.parse(readFileSync(paths.draftInventory, "utf8"));
    const reviewHtml = readFileSync(paths.reviewHtml, "utf8");
    expect(reviewHtml).toContain(draftInventory.entries[0].proposedName);
    expect(outcome).toEqual({
      kind: "ready-for-review",
      targetDir,
      draftInventoryPath: paths.draftInventory,
      reviewHtmlPath: paths.reviewHtml,
      artifactVersion: hashArtifact(draftInventory),
    });
  });
});
