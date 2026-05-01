import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resumeMigration } from "../lib/continue.ts";
import { runPlan } from "../lib/plan.ts";
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

describe("continue → plan end-to-end", () => {
  it("dispatches phase-3-plan when phase-2 has verified", async () => {
    const root = mkdtempSync(join(tmpdir(), "e2e-plan-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    const urls = ["https://example.com/", "https://example.com/about"];
    writePhase1(root, "001-initial", urls);
    writePhase2Library(root, urls);

    const dispatchers = {
      "phase-3-plan": async ({ targetDir, runDir }: { targetDir: string; runDir: string }) => {
        await runPlan({ targetDir, runDir });
      },
    };
    const result = await resumeMigration(root, { dispatchers });
    expect(result.kind).toBe("dispatched");
    if (result.kind === "dispatched") expect(result.phase).toBe("phase-3-plan");
    expect(existsSync(join(root, ".migration/runs/001-initial/ROADMAP.md"))).toBe(true);
    expect(existsSync(join(root, ".migration/runs/001-initial/phase-3-plan/VERIFICATION.md"))).toBe(true);
  });
});
