import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resumeMigration } from "../lib/continue.ts";
import { runBuild } from "../lib/build.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";

const baseSite = (sourceUrl: string) => ({
  sourceUrl, target: "./",
  inputMode: "url-only" as const,
  maxParallelPages: 4, maxParallelSections: 4,
});

describe("continue → build end-to-end", () => {
  it("dispatches phase-5-build when phase-4 has verified", async () => {
    const root = mkdtempSync(join(tmpdir(), "e2e-build-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });

    // Phases 1-4 verified, with minimum required artifacts.
    const runDir = join(root, ".migration/runs/001-initial");
    const p1 = join(runDir, "phase-1-discover");
    mkdirSync(join(p1, "discovery"), { recursive: true });
    writeFileSync(join(p1, "discovery/crawl.json"), JSON.stringify({
      sourceUrl: "https://example.com/", crawledAt: new Date().toISOString(),
      limits: { maxPages: 10, maxDepth: 2 }, sitemapUrls: [],
      pages: [{ url: "https://example.com/", slug: "home", title: "Home", depth: 0, discoveredVia: "seed", status: 200, outboundLinks: [] }],
      errors: [],
    }));
    writeFileSync(join(p1, "discovery/probe.json"), JSON.stringify({
      probedAt: new Date().toISOString(),
      pages: [{ url: "https://example.com/", matchedAdapters: ["/fake/adapter.json"], recommendation: "DIRECT_EXTRACTION", detectedCMP: null, isSPA: false }],
    }));
    writeFileSync(join(p1, "VERIFICATION.md"), "# verified");
    const lib = join(root, ".migration/library");
    mkdirSync(lib, { recursive: true });
    const now = new Date().toISOString();
    writeFileSync(join(lib, "layouts.json"), JSON.stringify({ header: null, footer: null, nav: null, updatedAt: now }));
    writeFileSync(join(lib, "components.json"), JSON.stringify({
      components: [{ id: "cluster-x", name: "PageBody", signature: "x", tagSkeleton: "section", memberSections: [{ id: "p0-s0", url: "https://example.com/" }], unique: false, propsRef: null }],
      updatedAt: now,
    }));
    writeFileSync(join(lib, "props.json"), JSON.stringify({ interfaces: [], updatedAt: now }));
    writeFileSync(join(lib, "routes.json"), JSON.stringify({
      routes: [{ sourceUrl: "https://example.com/", nextRoute: "/", params: {}, kind: "static" as const }],
      updatedAt: now,
    }));
    mkdirSync(join(runDir, "phase-2-analyze/analysis"), { recursive: true });
    writeFileSync(join(runDir, "phase-2-analyze/analysis/sections.json"), JSON.stringify({
      probedAt: now,
      pages: [{
        url: "https://example.com/",
        sections: [{
          id: "p0-s0", selector: "body > section", tagSkeleton: "section",
          pathShingles: ["body>section"], sampleText: "",
          boundingBox: { x: 0, y: 0, width: 1440, height: 600 },
        }],
      }],
    }));
    writeFileSync(join(runDir, "phase-2-analyze/VERIFICATION.md"), "# verified");
    mkdirSync(join(runDir, "phase-3-plan"), { recursive: true });
    writeFileSync(join(runDir, "phase-3-plan/VERIFICATION.md"), "# verified");
    writeFileSync(join(runDir, "ROADMAP.md"), "# Roadmap\n");
    mkdirSync(join(runDir, "phase-4-extract"), { recursive: true });
    writeFileSync(join(runDir, "phase-4-extract/VERIFICATION.md"), "# verified");
    const specDir = join(root, ".migration/pages/home/spec");
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, "01-section.styles.json"), "[]");
    writeFileSync(join(specDir, "01-section.structure.md"), "# section\n\n## Element Tree\n\n- div\n");
    // component-usage.json — match the schema used in test/build.test.ts.
    // If your build.test.ts uses {url, slug, components: [{id, sectionIndices, instances}], computedAt, unmatchedSectionIndices: []} — mirror that.
    writeFileSync(join(root, ".migration/pages/home/component-usage.json"), JSON.stringify({
      url: "https://example.com/", slug: "home", computedAt: now,
      components: [{ id: "cluster-x", sectionIndices: [0], instances: 1 }],
      unmatchedSectionIndices: [],
    }));
    mkdirSync(join(root, "src/app"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t", scripts: { build: "next build" } }));
    writeFileSync(join(root, "src/app/layout.tsx"), "export default function L({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }");

    const dispatchers = {
      "phase-5-build": async ({ targetDir, runDir }: { targetDir: string; runDir: string }) => {
        await runBuild({
          targetDir, runDir,
          runJsxGenerator: async ({ outputDir }) => {
            mkdirSync(outputDir, { recursive: true });
            writeFileSync(join(outputDir, "01-section.tsx"), "export default function S(){ return <section/>; }");
          },
          runNextBuild: async () => ({ exitCode: 0, stdout: "", stderr: "", packageManager: "npm" }),
          runVerifyBuildBaseline: async () => ({ passed: true }),
        });
      },
    };
    const result = await resumeMigration(root, { dispatchers });
    expect(result.kind).toBe("dispatched");
    if (result.kind === "dispatched") expect(result.phase).toBe("phase-5-build");
    expect(existsSync(join(root, "src/components/Home01Section.tsx"))).toBe(true);
    expect(existsSync(join(root, "src/app/page.tsx"))).toBe(true);
    expect(existsSync(join(runDir, "phase-5-build/VERIFICATION.md"))).toBe(true);
  });
});
