import { describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { migrationPaths } from "../lib/migration-paths.ts";
import { runComponentBatch } from "../lib/run-component-batch.ts";
import type { ApprovedInventoryEntry } from "../schemas/approved-inventory.ts";
import type { RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";

const now = "2026-05-07T12:00:00.000Z";

describe("runComponentBatch", () => {
  it("implements every component, verifies content components, skips shell diffs, and writes no approvals", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "component-batch-"));
    writeJson(migrationPaths(targetDir).rawDiscovery, rawDiscovery());
    const implement = vi.fn(async ({ entry }: { entry: ApprovedInventoryEntry }) => ({
      componentPath: join(targetDir, entry.filePath),
      storyPath: join(targetDir, `src/components/${entry.implementationName}.stories.tsx`),
      sectionInstanceIds: entry.sectionInstanceIds,
    }));
    const verify = vi.fn(async () => ({
      status: "FAIL" as const,
      ratios: { 390: 0.004, 768: 0.02, 1440: 0.003 },
      failingViewports: [768 as const],
      results: [
        {
          viewport: 390 as const,
          status: "PASS" as const,
          ratio: 0.004,
          referencePath: join(targetDir, ".migration/references/components/p0-s1-390.png"),
          storyUrl: "http://127.0.0.1:6006/?path=/story/migrated-components-hero--hero",
          diffPath: join(targetDir, ".migration/reports/component-batches/abcdefabcdef1234-diffs/Hero-390.diff.png"),
          diagnostics: [],
        },
        {
          viewport: 768 as const,
          status: "FAIL" as const,
          ratio: 0.02,
          referencePath: join(targetDir, ".migration/references/components/p0-s1-768.png"),
          storyUrl: "http://127.0.0.1:6006/?path=/story/migrated-components-hero--hero",
          diffPath: join(targetDir, ".migration/reports/component-batches/abcdefabcdef1234-diffs/Hero-768.diff.png"),
          diagnostics: [],
        },
      ],
    }));

    const result = await runComponentBatch({
      targetDir,
      artifactVersion: "abcdefabcdef1234",
      batch: [shellEntry(), contentEntry()],
      storybookBaseUrl: "http://127.0.0.1:6006",
      now: () => now,
      implementComponent: implement,
      verifyComponent: verify,
    });

    expect(implement).toHaveBeenCalledTimes(2);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Hero",
        references: [
          {
            viewport: 390,
            referencePath: join(targetDir, ".migration/references/components/p0-s1-390.png"),
            storyUrl: "http://127.0.0.1:6006/?path=/story/migrated-components-hero--hero",
          },
          {
            viewport: 768,
            referencePath: join(targetDir, ".migration/references/components/p0-s1-768.png"),
            storyUrl: "http://127.0.0.1:6006/?path=/story/migrated-components-hero--hero",
          },
          {
            viewport: 1440,
            referencePath: join(targetDir, ".migration/references/components/p0-s1-1440.png"),
            storyUrl: "http://127.0.0.1:6006/?path=/story/migrated-components-hero--hero",
          },
        ],
        diffOutputDir: join(targetDir, ".migration/reports/component-batches/abcdefabcdef1234-diffs"),
      }),
    );
    expect(result.reportPath).toBe(
      join(targetDir, ".migration/reports/component-batches/abcdefabcdef1234.json"),
    );
    expect(JSON.parse(readFileSync(result.reportPath, "utf8"))).toEqual({
      kind: "component-batch-report",
      artifactVersion: "abcdefabcdef1234",
      generatedAt: now,
      components: [
        {
          componentGroupId: "group-header",
          implementationName: "SiteHeader",
          kind: "shell",
          componentPath: join(targetDir, "src/components/SiteHeader.tsx"),
          storyPath: join(targetDir, "src/components/SiteHeader.stories.tsx"),
          verification: "skipped-by-design",
          storybookUrls: [],
          referencePaths: [],
          diffPaths: [],
          failingViewports: [],
          error: null,
        },
        {
          componentGroupId: "group-hero",
          implementationName: "Hero",
          kind: "content",
          componentPath: join(targetDir, "src/components/Hero.tsx"),
          storyPath: join(targetDir, "src/components/Hero.stories.tsx"),
          verification: "FAIL",
          storybookUrls: [
            "http://127.0.0.1:6006/?path=/story/migrated-components-hero--hero",
          ],
          referencePaths: [
            join(targetDir, ".migration/references/components/p0-s1-390.png"),
            join(targetDir, ".migration/references/components/p0-s1-768.png"),
            join(targetDir, ".migration/references/components/p0-s1-1440.png"),
          ],
          diffPaths: [
            join(targetDir, ".migration/reports/component-batches/abcdefabcdef1234-diffs/Hero-390.diff.png"),
            join(targetDir, ".migration/reports/component-batches/abcdefabcdef1234-diffs/Hero-768.diff.png"),
          ],
          failingViewports: [768],
          error: null,
        },
      ],
    });
    expect(existsSync(migrationPaths(targetDir).componentApproval("group-hero"))).toBe(false);
    expect(existsSync(migrationPaths(targetDir).componentApproval("group-header"))).toBe(false);
  });

  it("writes a failed report entry when component verification throws", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "component-batch-"));
    writeJson(migrationPaths(targetDir).rawDiscovery, rawDiscovery());

    const result = await runComponentBatch({
      targetDir,
      artifactVersion: "abcdefabcdef1234",
      batch: [contentEntry()],
      now: () => now,
      implementComponent: async ({ entry }) => ({
        componentPath: join(targetDir, entry.filePath),
        storyPath: join(targetDir, `src/components/${entry.implementationName}.stories.tsx`),
        sectionInstanceIds: entry.sectionInstanceIds,
      }),
      verifyComponent: async () => {
        throw new Error("storybook navigation timed out");
      },
    });

    expect(JSON.parse(readFileSync(result.reportPath, "utf8")).components).toEqual([
      expect.objectContaining({
        componentGroupId: "group-hero",
        verification: "FAIL",
        failingViewports: [390, 768, 1440],
        error: "storybook navigation timed out",
      }),
    ]);
  });
});

function shellEntry(): ApprovedInventoryEntry {
  return {
    componentGroupId: "group-header",
    proposedName: "SiteHeader",
    kind: "shell",
    sectionInstanceIds: ["p0-s0"],
    implementationName: "SiteHeader",
    filePath: "src/components/SiteHeader.tsx",
  };
}

function contentEntry(): ApprovedInventoryEntry {
  return {
    componentGroupId: "group-hero",
    proposedName: "Hero",
    kind: "content",
    sectionInstanceIds: ["p0-s1"],
    implementationName: "Hero",
    filePath: "src/components/Hero.tsx",
  };
}

function rawDiscovery(): RawDiscoveryEvidence {
  return {
    probedAt: now,
    pages: [
      {
        url: "https://example.com/",
        sections: [
          {
            id: "p0-s0",
            selector: "header",
            tagSkeleton: "header>nav",
            pathShingles: [],
            sampleText: "Header",
            boundingBox: { x: 0, y: 0, width: 1440, height: 80 },
          },
          {
            id: "p0-s1",
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
      components: [390, 768, 1440].map(viewport => ({
        sectionInstanceId: "p0-s1",
        url: "https://example.com/",
        viewport: viewport as 390 | 768 | 1440,
        path: `.migration/references/components/p0-s1-${viewport}.png`,
        sha256: `${viewport}`.padStart(16, "a"),
      })),
      pages: [],
    },
    source: {
      sourceUrl: "https://example.com/",
      capturedAt: now,
    },
  };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
