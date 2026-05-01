import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resumeMigration } from "../lib/continue.ts";
import { runExtract } from "../lib/extract.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";

const baseSite = (sourceUrl: string) => ({
  sourceUrl, target: "./",
  mode: "unattended" as const, goal: "wireframe" as const, inputMode: "url-only" as const,
  maxParallelPages: 4, maxParallelSections: 4,
});

function writePhases1to3(targetDir: string, urls: string[]) {
  const runDir = join(targetDir, ".migration/runs/001-initial");

  // Phase 1
  const p1 = join(runDir, "phase-1-discover");
  mkdirSync(join(p1, "discovery"), { recursive: true });
  writeFileSync(join(p1, "discovery/crawl.json"), JSON.stringify({
    sourceUrl: urls[0],
    crawledAt: new Date().toISOString(),
    limits: { maxPages: 10, maxDepth: 2 },
    sitemapUrls: [],
    pages: urls.map((u, i) => ({
      url: u, slug: i === 0 ? "home" : `p${i}`, title: u, depth: i === 0 ? 0 : 1,
      discoveredVia: i === 0 ? "seed" : "link", status: 200, outboundLinks: [],
    })),
    errors: [],
  }, null, 2));
  writeFileSync(join(p1, "discovery/probe.json"), JSON.stringify({
    probedAt: new Date().toISOString(),
    pages: urls.map(u => ({
      url: u, matchedAdapters: ["/fake/adapter.json"],
      recommendation: "DIRECT_EXTRACTION", detectedCMP: null, isSPA: false,
    })),
  }, null, 2));
  writeFileSync(join(p1, "VERIFICATION.md"), "# verified");

  // Phase 2
  const lib = join(targetDir, ".migration/library");
  mkdirSync(lib, { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(join(lib, "layouts.json"), JSON.stringify({
    header: null, footer: null, nav: null, updatedAt: now,
  }, null, 2));
  writeFileSync(join(lib, "components.json"), JSON.stringify({
    components: [{
      id: "cluster-x", name: "X", signature: "x",
      tagSkeleton: "section",
      memberSections: [{ id: "p0-s0", url: urls[0] }],
      unique: false, propsRef: null,
    }],
    updatedAt: now,
  }, null, 2));
  writeFileSync(join(lib, "props.json"), JSON.stringify({ interfaces: [], updatedAt: now }, null, 2));
  writeFileSync(join(lib, "routes.json"), JSON.stringify({
    routes: urls.map(u => ({
      sourceUrl: u, nextRoute: new URL(u).pathname || "/", params: {}, kind: "static" as const,
    })),
    updatedAt: now,
  }, null, 2));
  const p2 = join(runDir, "phase-2-analyze");
  mkdirSync(p2, { recursive: true });
  writeFileSync(join(p2, "VERIFICATION.md"), "# verified");

  // Phase 3
  const p3 = join(runDir, "phase-3-plan");
  mkdirSync(p3, { recursive: true });
  writeFileSync(join(p3, "VERIFICATION.md"), "# verified");
  writeFileSync(join(runDir, "ROADMAP.md"), "---\ngoal: wireframe\n---\n# Roadmap\n");
}

const stubExtract = async ({ url, slug, pagesDir }: { url: string; slug: string; pagesDir: string }) => {
  const specDir = join(pagesDir, slug, "spec");
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, "styles.json"), JSON.stringify({ sections: [{ tagSkeleton: "section" }] }));
  writeFileSync(join(specDir, "structure.json"), JSON.stringify({ tree: [] }));
  writeFileSync(join(specDir, "00-globals.json"), JSON.stringify({ body: {} }));
  writeFileSync(join(specDir, "images.json"), JSON.stringify({ totalImages: 0, sections: [] }));
  writeFileSync(join(specDir, "animations.json"), JSON.stringify({ sections: [] }));
  return {
    url, slug,
    extractedAt: new Date().toISOString(),
    viewport: { width: 1440, height: 900 },
    files: { styles: "spec/styles.json", images: "spec/images.json", animations: "spec/animations.json", structure: "spec/structure.json", globals: "spec/00-globals.json" },
    stats: { sectionCount: 1, imageCount: 0, animationCount: 0 },
    errors: [],
  };
};

describe("continue → extract end-to-end", () => {
  it("dispatches phase-4-extract when phase-3 has verified", async () => {
    const root = mkdtempSync(join(tmpdir(), "e2e-extract-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    writePhases1to3(root, ["https://example.com/", "https://example.com/about"]);

    const dispatchers = {
      "phase-4-extract": async ({ targetDir, runDir }: { targetDir: string; runDir: string }) => {
        await runExtract({
          targetDir, runDir,
          extractOne: stubExtract,
          validateExtraction: async () => ({ passed: true }),
          qualifyExtraction: async () => ({ passed: true, failures: [] }),
        });
      },
    };
    const result = await resumeMigration(root, { dispatchers });
    expect(result.kind).toBe("dispatched");
    if (result.kind === "dispatched") expect(result.phase).toBe("phase-4-extract");
    expect(existsSync(join(root, ".migration/pages/home/spec/styles.json"))).toBe(true);
    expect(existsSync(join(root, ".migration/runs/001-initial/phase-4-extract/VERIFICATION.md"))).toBe(true);
  });
});
