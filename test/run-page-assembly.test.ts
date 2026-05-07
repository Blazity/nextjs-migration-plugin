import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it, vi } from "vitest";
import { hashArtifact } from "../lib/artifact-hash.ts";
import { migrationPaths } from "../lib/migration-paths.ts";
import { runPageAssembly } from "../lib/run-page-assembly.ts";
import type { ApprovedInventory } from "../schemas/approved-inventory.ts";
import type { RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";
import type { DiffResult } from "../scripts/lib/visual-verify-core.ts";

const now = "2026-05-07T12:00:00.000Z";
const artifactVersion = "abcdefabcdef1234";

describe("runPageAssembly", () => {
  it("writes a page from approved components, builds, verifies full-page references at 2%, and writes a report", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "page-assembly-"));
    const paths = migrationPaths(targetDir);
    const raw = rawDiscovery();
    const guard = queueGuard();
    const order: string[] = [];
    const ratios = [0, 0.01, 0.019];
    const png = new PNG({ width: 10, height: 10 });
    writeJson(paths.approvedInventory, approvedInventory());
    writeJson(paths.rawDiscovery, raw);

    const result = await runPageAssembly({
      targetDir,
      slug: "home",
      componentGroupIds: ["group-header", "group-hero"],
      now: () => now,
      browserQueue: guard.queue,
      buildProject: vi.fn(async () => {
        order.push("build");
        return { exitCode: 0 as const, stdout: "built", stderr: "", packageManager: "pnpm" as const };
      }),
      screenshotCapturer: async ({ viewport, outputPath }) => {
        guard.assertActive();
        order.push(`screenshot-${viewport}`);
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, `page-${viewport}`);
      },
      readPng: vi.fn(() => png),
      diffPngs: vi.fn(() => {
        const ratio = ratios.shift() ?? 0;
        return {
          width: 10,
          height: 10,
          mismatch: ratio * 100,
          ratio,
          diff: png,
        } satisfies DiffResult;
      }),
      assessDiff: vi.fn(({ ratio, maxDiffRatio }) => ({
        status: ratio <= maxDiffRatio ? "PASS" as const : "FAIL" as const,
        ratio,
        diagnostics: [],
      })),
      writePng: vi.fn(),
    });

    const pagePath = join(targetDir, "src/app/home/page.tsx");
    expect(readFileSync(pagePath, "utf8")).toContain('import SiteHeader from "@/components/SiteHeader";');
    expect(readFileSync(pagePath, "utf8")).toContain('import Hero from "@/components/Hero";');
    expect(readFileSync(pagePath, "utf8")).toMatch(/<SiteHeader \/>\s+<Hero \/>/);
    expect(order).toEqual(["build", "screenshot-390", "screenshot-768", "screenshot-1440"]);
    expect(guard.calls()).toBe(3);
    expect(result.reportPath).toBe(join(targetDir, ".migration/reports/page-assembly/home.json"));
    expect(JSON.parse(readFileSync(result.reportPath, "utf8"))).toEqual({
      kind: "page-assembly-report",
      slug: "home",
      artifactVersion,
      pageReferenceVersion: hashArtifact(raw.referenceScreenshots.pages),
      generatedAt: now,
      componentGroupIds: ["group-header", "group-hero"],
      pagePath,
      build: { exitCode: 0, stdout: "built", stderr: "", packageManager: "pnpm" },
      verification: "PASS",
      referencePaths: [390, 768, 1440].map(viewport =>
        join(targetDir, ".migration/references/pages/home-${viewport}.png").replace("${viewport}", String(viewport))
      ),
      screenshotPaths: [390, 768, 1440].map(viewport =>
        join(targetDir, ".migration/reports/page-assembly/home-${viewport}.png").replace("${viewport}", String(viewport))
      ),
      diffPaths: [],
      failingViewports: [],
      error: null,
      results: [
        expect.objectContaining({ viewport: 390, status: "PASS", ratio: 0 }),
        expect.objectContaining({ viewport: 768, status: "PASS", ratio: 0.01 }),
        expect.objectContaining({ viewport: 1440, status: "PASS", ratio: 0.019 }),
      ],
    });
    expect(existsSync(paths.pageApproval("home"))).toBe(false);
  });
});

function approvedInventory(): ApprovedInventory {
  return {
    approvedAt: now,
    artifactVersion,
    entries: [
      {
        componentGroupId: "group-header",
        proposedName: "SiteHeader",
        kind: "shell",
        sectionInstanceIds: ["p0-s0"],
        implementationName: "SiteHeader",
        filePath: "src/components/SiteHeader.tsx",
      },
      {
        componentGroupId: "group-hero",
        proposedName: "Hero",
        kind: "content",
        sectionInstanceIds: ["p0-s1"],
        implementationName: "Hero",
        filePath: "src/components/Hero.tsx",
      },
    ],
  };
}

function rawDiscovery(): RawDiscoveryEvidence {
  return {
    probedAt: now,
    pages: [{
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
    }],
    referenceScreenshots: {
      components: [],
      pages: [390, 768, 1440].map(viewport => ({
        slug: "home",
        url: "https://example.com/",
        viewport: viewport as 390 | 768 | 1440,
        path: `references/pages/home-${viewport}.png`,
        sha256: `${viewport}`.padStart(64, "a"),
      })),
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

function queueGuard() {
  let active = false;
  let calls = 0;
  return {
    queue: {
      async enqueue<T>(run: () => Promise<T> | T): Promise<T> {
        calls += 1;
        active = true;
        try {
          return await run();
        } finally {
          active = false;
        }
      },
    },
    assertActive() {
      if (!active) throw new Error("browser work ran outside BrowserWorkQueue");
    },
    calls() {
      return calls;
    },
  };
}
