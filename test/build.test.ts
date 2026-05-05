import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBuild } from "../lib/build.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";

const baseSite = (sourceUrl: string) => ({
  sourceUrl, target: "./",
  mode: "unattended" as const, goal: "wireframe" as const, inputMode: "url-only" as const,
  maxParallelPages: 4, maxParallelSections: 4,
});

function writePhases1to4(targetDir: string, urls: string[]) {
  const runDir = join(targetDir, ".migration/runs/001-initial");
  // Phase 1
  const p1 = join(runDir, "phase-1-discover");
  mkdirSync(join(p1, "discovery"), { recursive: true });
  writeFileSync(join(p1, "discovery/crawl.json"), JSON.stringify({
    sourceUrl: urls[0], crawledAt: new Date().toISOString(),
    limits: { maxPages: 10, maxDepth: 2 }, sitemapUrls: [],
    pages: urls.map((u, i) => ({
      url: u, slug: i === 0 ? "home" : `p${i}`, title: u, depth: i === 0 ? 0 : 1,
      discoveredVia: i === 0 ? "seed" : "link", status: 200, outboundLinks: [],
    })), errors: [],
  }));
  writeFileSync(join(p1, "discovery/probe.json"), JSON.stringify({
    probedAt: new Date().toISOString(),
    pages: urls.map(u => ({ url: u, matchedAdapters: ["/fake/adapter.json"], recommendation: "DIRECT_EXTRACTION", detectedCMP: null, isSPA: false })),
  }));
  writeFileSync(join(p1, "VERIFICATION.md"), "# verified");
  // Phase 2 library
  const lib = join(targetDir, ".migration/library");
  mkdirSync(lib, { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(join(lib, "layouts.json"), JSON.stringify({ header: null, footer: null, nav: null, updatedAt: now }));
  writeFileSync(join(lib, "components.json"), JSON.stringify({
    components: [{
      id: "cluster-x", name: "PageBody", signature: "x",
      tagSkeleton: "section",
      memberSections: urls.map((u, i) => ({ id: `p${i}-s0`, url: u })),
      unique: false, propsRef: null,
    }],
    updatedAt: now,
  }));
  writeFileSync(join(lib, "props.json"), JSON.stringify({ interfaces: [], updatedAt: now }));
  writeFileSync(join(lib, "routes.json"), JSON.stringify({
    routes: urls.map(u => ({ sourceUrl: u, nextRoute: new URL(u).pathname || "/", params: {}, kind: "static" as const })),
    updatedAt: now,
  }));
  const analysisDir = join(runDir, "phase-2-analyze/analysis");
  mkdirSync(analysisDir, { recursive: true });
  writeFileSync(join(analysisDir, "sections.json"), JSON.stringify({
    probedAt: now,
    pages: urls.map(u => ({
      url: u,
      sections: [{
        id: `p0-s0`,
        selector: "body > section",
        tagSkeleton: "section",
        pathShingles: ["body>section"],
        sampleText: "",
        boundingBox: { x: 0, y: 0, width: 1440, height: 600 },
      }],
    })),
  }));
  writeFileSync(join(runDir, "phase-2-analyze/VERIFICATION.md"), "# verified");
  // Phase 3
  const p3 = join(runDir, "phase-3-plan");
  mkdirSync(p3, { recursive: true });
  writeFileSync(join(p3, "VERIFICATION.md"), "# verified");
  writeFileSync(join(runDir, "ROADMAP.md"), "---\ngoal: wireframe\n---\n# Roadmap\n");
  // Phase 4
  const p4 = join(runDir, "phase-4-extract");
  mkdirSync(p4, { recursive: true });
  writeFileSync(join(p4, "VERIFICATION.md"), "# verified");
  for (const [i, u] of urls.entries()) {
    const slug = i === 0 ? "home" : `p${i}`;
    const specDir = join(targetDir, ".migration/pages", slug, "spec");
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, "01-section.styles.json"), "[]");
    writeFileSync(join(specDir, "01-section.structure.md"), "# section\n\n## Element Tree\n\n- div\n");
    writeFileSync(
      join(targetDir, ".migration/pages", slug, "manifest.json"),
      JSON.stringify({
        url: u, slug, extractedAt: now, viewport: { width: 1440, height: 900 },
        files: { styles: "spec/styles.json", images: "spec/images.json", animations: "spec/animations.json", structure: "spec/structure.json", globals: "spec/00-globals.json" },
        stats: { sectionCount: 1, imageCount: 0, animationCount: 0 }, errors: [],
      }),
    );
    writeFileSync(
      join(targetDir, ".migration/pages", slug, "component-usage.json"),
      JSON.stringify({
        url: u,
        slug,
        computedAt: now,
        components: [{ id: "cluster-x", instances: 1, sectionIndices: [0] }],
        unmatchedSectionIndices: [],
      }),
    );
  }
}

function writeTargetScaffold(targetDir: string) {
  mkdirSync(join(targetDir, "src/app"), { recursive: true });
  writeFileSync(join(targetDir, "package.json"), JSON.stringify({ name: "t", scripts: { build: "next build" } }));
  writeFileSync(join(targetDir, "src/app/layout.tsx"), "export default function L({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }");
}

describe("runBuild", () => {
  it("emits component + page TSX, runs next build, and emits VERIFICATION.md when all gates pass", async () => {
    const root = mkdtempSync(join(tmpdir(), "build-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    writePhases1to4(root, ["https://example.com/", "https://example.com/about"]);
    writeTargetScaffold(root);

    await runBuild({
      targetDir: root,
      runDir: "001-initial",
      runJsxGenerator: async ({ outputDir }) => {
        mkdirSync(outputDir, { recursive: true });
        writeFileSync(join(outputDir, "01-section.tsx"), "export default function S(){ return <section/>; }");
      },
      runNextBuild: async () => ({ exitCode: 0, stdout: "ok", stderr: "", packageManager: "npm" }),
      runVerifyBuildBaseline: async () => ({ passed: true }),
    });

    const phaseDir = join(root, ".migration/runs/001-initial/phase-5-build");
    expect(existsSync(join(phaseDir, "PLAN.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "EXECUTION.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "build/manifest.json"))).toBe(true);
    expect(existsSync(join(root, "src/components/PageBody.tsx"))).toBe(true);
    expect(existsSync(join(root, "src/app/page.tsx"))).toBe(true);
    expect(existsSync(join(root, "src/app/about/page.tsx"))).toBe(true);
    const v = JSON.parse(readFileSync(join(phaseDir, "verification.json"), "utf8"));
    expect(v.passed).toBe(true);
  });

  it("does NOT emit VERIFICATION.md when next build fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "build-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    writePhases1to4(root, ["https://example.com/"]);
    writeTargetScaffold(root);

    await runBuild({
      targetDir: root,
      runDir: "001-initial",
      runJsxGenerator: async ({ outputDir }) => {
        mkdirSync(outputDir, { recursive: true });
        writeFileSync(join(outputDir, "01-section.tsx"), "");
      },
      runNextBuild: async () => ({ exitCode: 1, stdout: "", stderr: "type error", packageManager: "npm" }),
      runVerifyBuildBaseline: async () => ({ passed: true }),
    });

    const phaseDir = join(root, ".migration/runs/001-initial/phase-5-build");
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(false);
    const v = JSON.parse(readFileSync(join(phaseDir, "verification.json"), "utf8"));
    expect(v.passed).toBe(false);
    expect(v.criteria.find((c: { name: string }) => c.name.includes("next build")).passed).toBe(false);
  });

  it("does NOT emit VERIFICATION.md when scaffold check fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "build-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    writePhases1to4(root, ["https://example.com/"]);
    // intentionally skip writeTargetScaffold

    await runBuild({
      targetDir: root,
      runDir: "001-initial",
      runJsxGenerator: async () => {},
      runNextBuild: async () => ({ exitCode: 0, stdout: "", stderr: "", packageManager: "npm" }),
      runVerifyBuildBaseline: async () => ({ passed: true }),
    });

    const phaseDir = join(root, ".migration/runs/001-initial/phase-5-build");
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(false);
  });

  it("wraps raw .generated.jsx output from the vendored generate-jsx.ts into a valid component (issues 007 + 008)", async () => {
    const root = mkdtempSync(join(tmpdir(), "build-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    writePhases1to4(root, ["https://example.com/"]);
    writeTargetScaffold(root);

    // Stub matches production format: .generated.jsx extension, raw JSX
    // fragment with a leading expression-comment header, references <Image>
    // with no import — exactly what scripts/generate-jsx.ts emits today.
    await runBuild({
      targetDir: root,
      runDir: "001-initial",
      runJsxGenerator: async ({ outputDir }) => {
        mkdirSync(outputDir, { recursive: true });
        writeFileSync(
          join(outputDir, "01-section.generated.jsx"),
          '{/* Auto-generated */}\n{/* Source: 01-section.structure.md */}\n\n<div className="hero"><Image src="/x.png" alt="x" width={10} height={10} /></div>',
        );
      },
      runNextBuild: async () => ({ exitCode: 0, stdout: "", stderr: "", packageManager: "npm" }),
      runVerifyBuildBaseline: async () => ({ passed: true }),
    });

    const componentPath = join(root, "src/components/PageBody.tsx");
    expect(existsSync(componentPath)).toBe(true);
    const tsx = readFileSync(componentPath, "utf8");
    expect(tsx).toContain('import Image from "next/image";');
    expect(tsx).toMatch(/export default function PageBody\(\)/);
    // Leading JSX comments must be stripped from the wrapped module.
    expect(tsx.startsWith("{/*")).toBe(false);
    const v = JSON.parse(readFileSync(join(root, ".migration/runs/001-initial/phase-5-build/verification.json"), "utf8"));
    expect(v.passed).toBe(true);
  });

  it("emits Header.tsx for a populated layout shell that the layout assembler imports (issue 010)", async () => {
    const root = mkdtempSync(join(tmpdir(), "build-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    writePhases1to4(root, ["https://example.com/"]);
    writeTargetScaffold(root);

    // Promote the existing section into a layout-shell entry. tagSkeleton
    // matches what writePhases1to4 already wrote into sections.json.
    const lib = join(root, ".migration/library");
    const now = new Date().toISOString();
    writeFileSync(join(lib, "layouts.json"), JSON.stringify({
      header: {
        id: "cluster-header",
        signature: "header-sig",
        appearsOn: ["https://example.com/"],
        tagSkeleton: "section",
      },
      footer: null, nav: null, updatedAt: now,
    }));

    await runBuild({
      targetDir: root,
      runDir: "001-initial",
      runJsxGenerator: async ({ outputDir }) => {
        mkdirSync(outputDir, { recursive: true });
        writeFileSync(join(outputDir, "01-section.generated.jsx"), '<header className="site-nav"><a href="/">Home</a></header>');
      },
      runNextBuild: async () => ({ exitCode: 0, stdout: "", stderr: "", packageManager: "npm" }),
      runVerifyBuildBaseline: async () => ({ passed: true }),
    });

    const headerPath = join(root, "src/components/Header.tsx");
    expect(existsSync(headerPath)).toBe(true);
    const headerTsx = readFileSync(headerPath, "utf8");
    expect(headerTsx).toMatch(/export default function Header\(\)/);
    expect(headerTsx).toContain('<header className="site-nav">');

    // assembleRootLayoutTsx imports `Header` — file must exist for layout to compile
    const layoutPath = join(root, "src/app/layout.tsx");
    const layoutTsx = readFileSync(layoutPath, "utf8");
    expect(layoutTsx).toContain('import Header from "@/components/Header"');
    expect(layoutTsx).toContain("<Header />");
    // Globals CSS import is required for Tailwind to compile into the route
    // bundle. Without it the served page is unstyled. See issue 011.
    expect(layoutTsx).toContain('import "./globals.css"');
  });
});
