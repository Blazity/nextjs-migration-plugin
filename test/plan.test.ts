import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPlan } from "../lib/plan.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";
import { RoadmapSchema } from "../schemas/roadmap.ts";

const baseSite = (sourceUrl: string) => ({
  sourceUrl, target: "./",
  inputMode: "url-only" as const,
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
  writeFileSync(join(phaseDir, "VERIFICATION.md"), "# verified");
}

function writePhase2Library(targetDir: string, urls: string[]) {
  const lib = join(targetDir, ".migration/library");
  mkdirSync(lib, { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(join(lib, "layouts.json"), JSON.stringify({
    header: null,
    footer: {
      id: "cluster-footer", signature: "footer", appearsOn: urls,
      tagSkeleton: "footer>div",
    },
    nav: null,
    updatedAt: now,
  }, null, 2));
  writeFileSync(join(lib, "components.json"), JSON.stringify({
    components: [
      {
        id: "cluster-hero", name: "Hero", signature: "hero",
        tagSkeleton: "section>div>h1",
        memberSections: [{ id: "p0-s0", url: urls[0] }],
        unique: false, propsRef: "HeroProps",
      },
    ],
    updatedAt: now,
  }, null, 2));
  writeFileSync(join(lib, "props.json"), JSON.stringify({
    interfaces: [{ name: "HeroProps", fields: [] }],
    updatedAt: now,
  }, null, 2));
  writeFileSync(join(lib, "routes.json"), JSON.stringify({
    routes: urls.map(u => ({
      sourceUrl: u,
      nextRoute: new URL(u).pathname === "/" ? "/" : new URL(u).pathname,
      params: {},
      kind: "static" as const,
    })),
    updatedAt: now,
  }, null, 2));
  const phase2Dir = join(targetDir, ".migration/runs/001-initial/phase-2-analyze");
  mkdirSync(phase2Dir, { recursive: true });
  writeFileSync(join(phase2Dir, "VERIFICATION.md"), "# verified");
}

describe("runPlan", () => {
  it("writes ROADMAP.md at the run top level + phase-3 verification on a healthy library", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    const urls = ["https://example.com/", "https://example.com/about"];
    writePhase1(root, "001-initial", urls);
    writePhase2Library(root, urls);

    await runPlan({ targetDir: root, runDir: "001-initial" });

    const runDir = join(root, ".migration/runs/001-initial");
    const phaseDir = join(runDir, "phase-3-plan");
    expect(existsSync(join(runDir, "ROADMAP.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "PLAN.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "EXECUTION.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "verification.json"))).toBe(true);
  });

  it("writes a roadmap whose frontmatter validates against RoadmapSchema", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    const urls = ["https://example.com/"];
    writePhase1(root, "001-initial", urls);
    writePhase2Library(root, urls);

    await runPlan({ targetDir: root, runDir: "001-initial" });

    const { loadRoadmap } = await import("../lib/load-roadmap.ts");
    const path = join(root, ".migration/runs/001-initial/ROADMAP.md");
    const result = loadRoadmap(path);
    expect(result.valid).toBe(true);
    if (result.valid) {
      RoadmapSchema.parse(result.data);
      expect("goal" in result.data).toBe(false);
      expect("mode" in result.data).toBe(false);
      expect(result.data.buildOrder.length).toBeGreaterThan(0);
    }
  });

  it("does NOT emit VERIFICATION.md when crawl.json is missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    await runPlan({ targetDir: root, runDir: "001-initial" });
    const phaseDir = join(root, ".migration/runs/001-initial/phase-3-plan");
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(false);
    const v = JSON.parse(readFileSync(join(phaseDir, "verification.json"), "utf8"));
    expect(v.passed).toBe(false);
  });

  it("does NOT emit VERIFICATION.md when a route has no build-order entry", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    const urls = ["https://example.com/", "https://example.com/orphan"];
    writePhase1(root, "001-initial", urls);
    writePhase2Library(root, ["https://example.com/"]);
    await runPlan({ targetDir: root, runDir: "001-initial" });
    const phaseDir = join(root, ".migration/runs/001-initial/phase-3-plan");
    const v = JSON.parse(readFileSync(join(phaseDir, "verification.json"), "utf8"));
    expect(v.passed).toBe(false);
    expect(v.criteria.find((c: { name: string }) => c.name.includes("page in crawl")).passed).toBe(false);
  });

  it("does not require user roadmap approval in the guided flow", async () => {
    const root = mkdtempSync(join(tmpdir(), "plan-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    const urls = ["https://example.com/"];
    writePhase1(root, "001-initial", urls);
    writePhase2Library(root, urls);

    await runPlan({ targetDir: root, runDir: "001-initial" });

    const phaseDir = join(root, ".migration/runs/001-initial/phase-3-plan");
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(true);
    const v = JSON.parse(readFileSync(join(phaseDir, "verification.json"), "utf8"));
    expect(v.criteria.find((c: { name: string }) => c.name.includes("user approved"))).toBeUndefined();
  });
});
