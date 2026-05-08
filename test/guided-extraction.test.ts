import { describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ensureGuidedExtractionReady } from "../lib/guided-extraction.ts";
import { migrationPaths } from "../lib/migration-paths.ts";
import type { PageSpecManifest } from "../schemas/page-spec.ts";
import type { RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";

const now = "2026-05-08T12:00:00.000Z";

describe("ensureGuidedExtractionReady", () => {
  it("extracts specs and generates section TSX before component batches", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "guided-extraction-"));
    writeJson(migrationPaths(targetDir).rawDiscovery, rawDiscovery());
    writeJson(join(targetDir, ".migration/discovery/probe.json"), probe());
    writeFile(
      join(targetDir, ".migration/pages/home/generated/01-section.tsx"),
      "export default function Placeholder() { return null; }\n",
    );
    const extractPage = vi.fn(async ({ url, slug, pagesDir }: {
      url: string;
      slug: string;
      pagesDir: string;
    }) => {
      const specDir = join(pagesDir, slug, "spec");
      mkdirSync(specDir, { recursive: true });
      writeFileSync(join(specDir, "00-globals.json"), JSON.stringify({ body: {} }));
      writeFileSync(join(specDir, "styles.json"), JSON.stringify({ sections: [{}] }));
      writeFileSync(join(specDir, "images.json"), JSON.stringify({ totalImages: 0 }));
      writeFileSync(join(specDir, "animations.json"), JSON.stringify({ sections: [] }));
      writeFileSync(join(specDir, "structure.json"), JSON.stringify({ tree: [] }));
      return manifest(url, slug);
    });
    const runJsxGeneration = vi.fn(async ({ outputDir }: { outputDir: string }) => {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(join(outputDir, "01-hero.generated.jsx"), "<section>Hero</section>");
      return { durationMs: 1 };
    });

    const result = await ensureGuidedExtractionReady({
      targetDir,
      artifactVersion: "abcdefabcdef1234",
      pluginRoot: "/plugin",
      extractPage,
      runJsxGeneration,
      now: () => now,
    });

    expect(extractPage).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://example.com/",
      slug: "home",
      adapterPath: "/adapters/webflow.json",
    }));
    expect(runJsxGeneration).toHaveBeenCalledWith({
      specsDir: join(targetDir, ".migration/pages/home/spec"),
      outputDir: join(targetDir, ".migration/pages/home/generated"),
      pluginRoot: "/plugin",
    });
    expect(result.entries).toEqual([
      expect.objectContaining({
        url: "https://example.com/",
        slug: "home",
        status: "generated",
      }),
    ]);
    expect(readFileSync(join(targetDir, "src/app/globals.css"), "utf8")).toContain("@theme inline");
    expect(existsSync(join(targetDir, ".migration/pages/home/generated/01-hero.generated.jsx"))).toBe(true);
    expect(JSON.parse(readFileSync(result.reportPath, "utf8"))).toEqual(result);
  });

  it("skips pages that already have extracted specs and generated TSX", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "guided-extraction-"));
    writeJson(migrationPaths(targetDir).rawDiscovery, rawDiscovery());
    writeJson(join(targetDir, ".migration/discovery/probe.json"), probe());
    writeJson(join(targetDir, ".migration/pages/home/manifest.json"), manifest("https://example.com/", "home"));
    writeFile(join(targetDir, ".migration/pages/home/spec/00-globals.json"), JSON.stringify({ body: {} }));
    writeFile(join(targetDir, ".migration/pages/home/generated/01-hero.generated.jsx"), "<section>Hero</section>");
    const extractPage = vi.fn();
    const runJsxGeneration = vi.fn();

    const result = await ensureGuidedExtractionReady({
      targetDir,
      artifactVersion: "abcdefabcdef1234",
      pluginRoot: "/plugin",
      extractPage,
      runJsxGeneration,
      now: () => now,
    });

    expect(extractPage).not.toHaveBeenCalled();
    expect(runJsxGeneration).not.toHaveBeenCalled();
    expect(result.entries).toEqual([
      expect.objectContaining({
        status: "skipped",
      }),
    ]);
  });
});

function rawDiscovery(): RawDiscoveryEvidence {
  return {
    probedAt: now,
    pages: [
      {
        url: "https://example.com/",
        sections: [
          {
            id: "p0-s0",
            selector: "main > section",
            tagSkeleton: "section>h1",
            pathShingles: [],
            sampleText: "Hero",
            boundingBox: { x: 0, y: 0, width: 1440, height: 500 },
          },
        ],
      },
    ],
    referenceScreenshots: {
      components: [],
      pages: [
        {
          slug: "home",
          url: "https://example.com/",
          viewport: 1440,
          path: ".migration/references/pages/home-1440.png",
          sha256: "abcdefabcdef1234",
        },
      ],
    },
    source: {
      sourceUrl: "https://example.com/",
      capturedAt: now,
    },
  };
}

function probe() {
  return {
    probedAt: now,
    pages: [
      {
        url: "https://example.com/",
        matchedAdapters: ["/adapters/webflow.json"],
        recommendation: "DIRECT_EXTRACTION",
        detectedCMP: null,
        isSPA: false,
      },
    ],
  };
}

function manifest(url: string, slug: string): PageSpecManifest {
  return {
    url,
    slug,
    extractedAt: now,
    viewport: { width: 1440, height: 900 },
    files: {
      styles: "spec/styles.json",
      images: "spec/images.json",
      animations: "spec/animations.json",
      structure: "spec/structure.json",
      globals: "spec/00-globals.json",
    },
    stats: { sectionCount: 1, imageCount: 0, animationCount: 0 },
    errors: [],
  };
}

function writeJson(path: string, value: unknown): void {
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFile(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}
