import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runExtract } from "../lib/extract.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";

const baseSite = (sourceUrl: string) => ({
  sourceUrl, target: "./",
  mode: "unattended" as const, goal: "wireframe" as const, inputMode: "url-only" as const,
  maxParallelPages: 4, maxParallelSections: 4,
});

function writePhase1(targetDir: string, runDir: string, urls: string[]) {
  const phaseDir = join(targetDir, ".migration/runs", runDir, "phase-1-discover");
  const discoveryDir = join(phaseDir, "discovery");
  mkdirSync(discoveryDir, { recursive: true });
  writeFileSync(join(discoveryDir, "crawl.json"), JSON.stringify({
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
  writeFileSync(join(discoveryDir, "probe.json"), JSON.stringify({
    probedAt: new Date().toISOString(),
    pages: urls.map(u => ({
      url: u,
      matchedAdapters: ["/fake/adapter.json"],
      recommendation: "DIRECT_EXTRACTION",
      detectedCMP: null,
      isSPA: false,
    })),
  }, null, 2));
  writeFileSync(join(phaseDir, "VERIFICATION.md"), "# verified");
}

function writePhase2Library(targetDir: string, urls: string[]) {
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
  const phase2Dir = join(targetDir, ".migration/runs/001-initial/phase-2-analyze");
  mkdirSync(phase2Dir, { recursive: true });
  writeFileSync(join(phase2Dir, "VERIFICATION.md"), "# verified");
}

function writePhase3Roadmap(targetDir: string) {
  const phase3Dir = join(targetDir, ".migration/runs/001-initial/phase-3-plan");
  mkdirSync(phase3Dir, { recursive: true });
  writeFileSync(join(phase3Dir, "VERIFICATION.md"), "# verified");
  writeFileSync(join(targetDir, ".migration/runs/001-initial/ROADMAP.md"), "---\ngoal: wireframe\n---\n# Roadmap\n");
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

describe("runExtract", () => {
  it("extracts every page in routes.json, writes manifest + component-usage, emits VERIFICATION.md when all gates pass", async () => {
    const root = mkdtempSync(join(tmpdir(), "extract-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    const urls = ["https://example.com/", "https://example.com/about"];
    writePhase1(root, "001-initial", urls);
    writePhase2Library(root, urls);
    writePhase3Roadmap(root);

    await runExtract({
      targetDir: root,
      runDir: "001-initial",
      extractOne: stubExtract,
      validateExtraction: async () => ({ passed: true }),
      qualifyExtraction: async () => ({ passed: true, failures: [] }),
    });

    const phaseDir = join(root, ".migration/runs/001-initial/phase-4-extract");
    expect(existsSync(join(phaseDir, "PLAN.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "EXECUTION.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "extraction/manifest.json"))).toBe(true);

    expect(existsSync(join(root, ".migration/pages/home/spec/styles.json"))).toBe(true);
    expect(existsSync(join(root, ".migration/pages/home/component-usage.json"))).toBe(true);
    expect(existsSync(join(root, ".migration/pages/p1/spec/styles.json"))).toBe(true);
  });

  it("does NOT emit VERIFICATION.md when validate-extraction fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "extract-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    const urls = ["https://example.com/", "https://example.com/about"];
    writePhase1(root, "001-initial", urls);
    writePhase2Library(root, urls);
    writePhase3Roadmap(root);

    await runExtract({
      targetDir: root,
      runDir: "001-initial",
      extractOne: stubExtract,
      validateExtraction: async () => ({ passed: false, detail: "duplicate spec hash" }),
      qualifyExtraction: async () => ({ passed: true, failures: [] }),
    });

    const phaseDir = join(root, ".migration/runs/001-initial/phase-4-extract");
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(false);
    const v = JSON.parse(readFileSync(join(phaseDir, "verification.json"), "utf8"));
    expect(v.passed).toBe(false);
    expect(v.criteria.find((c: { name: string }) => c.name.includes("validate-extraction")).passed).toBe(false);
  });

  it("does NOT emit VERIFICATION.md when qualify-extraction fails for any page", async () => {
    const root = mkdtempSync(join(tmpdir(), "extract-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    const urls = ["https://example.com/", "https://example.com/about"];
    writePhase1(root, "001-initial", urls);
    writePhase2Library(root, urls);
    writePhase3Roadmap(root);

    await runExtract({
      targetDir: root,
      runDir: "001-initial",
      extractOne: stubExtract,
      validateExtraction: async () => ({ passed: true }),
      qualifyExtraction: async () => ({
        passed: false,
        failures: [{ url: "https://example.com/about", detail: "section count mismatch" }],
      }),
    });

    const phaseDir = join(root, ".migration/runs/001-initial/phase-4-extract");
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(false);
    const v = JSON.parse(readFileSync(join(phaseDir, "verification.json"), "utf8"));
    expect(v.criteria.find((c: { name: string }) => c.name.includes("qualify-extraction")).passed).toBe(false);
  });

  it("respects maxParallelPages by capping in-flight extractions", async () => {
    const root = mkdtempSync(join(tmpdir(), "extract-"));
    await bootstrapMigration({ targetDir: root, site: { ...baseSite("https://example.com/"), maxParallelPages: 2 } });
    const urls = Array.from({ length: 6 }, (_, i) => `https://example.com/p${i}`);
    writePhase1(root, "001-initial", urls);
    writePhase2Library(root, urls);
    writePhase3Roadmap(root);

    let inflight = 0;
    let peakInflight = 0;
    const slowStub: typeof stubExtract = async (args) => {
      inflight++;
      peakInflight = Math.max(peakInflight, inflight);
      await new Promise(r => setTimeout(r, 20));
      const m = await stubExtract(args);
      inflight--;
      return m;
    };

    await runExtract({
      targetDir: root,
      runDir: "001-initial",
      extractOne: slowStub,
      validateExtraction: async () => ({ passed: true }),
      qualifyExtraction: async () => ({ passed: true, failures: [] }),
    });
    expect(peakInflight).toBeLessThanOrEqual(2);
    expect(peakInflight).toBeGreaterThan(0);
  });
});
