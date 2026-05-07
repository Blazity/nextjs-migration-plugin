import { describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapMigration } from "../lib/bootstrap.ts";
import { runVisualPolish, resolvePolishScope, VISUAL_POLISH_VIEWPORTS } from "../lib/polish.ts";

const site = {
  sourceUrl: "https://example.com",
  target: "./",
  mode: "unattended" as const,
  goal: "pixel-perfect" as const,
  inputMode: "url-only" as const,
  maxParallelPages: 4,
  maxParallelSections: 2,
};

function makeTarget() {
  const target = mkdtempSync(join(tmpdir(), "polish-"));
  return target;
}

async function writeMigrationState(target: string) {
  await bootstrapMigration({ targetDir: target, site });
  const run = join(target, ".migration/runs/001-initial");
  for (const phase of ["phase-1-discover", "phase-2-analyze", "phase-3-plan", "phase-4-extract", "phase-5-build"]) {
    mkdirSync(join(run, phase), { recursive: true });
    writeFileSync(join(run, phase, "VERIFICATION.md"), "# verified\n");
  }
  mkdirSync(join(run, "phase-1-discover/discovery"), { recursive: true });
  writeFileSync(join(run, "phase-1-discover/discovery/crawl.json"), JSON.stringify({
    sourceUrl: "https://example.com",
    crawledAt: "2026-05-07T00:00:00.000Z",
    limits: { maxPages: 50, maxDepth: 2 },
    sitemapUrls: [],
    pages: [
      { url: "https://example.com/", slug: "home", title: "Home", depth: 0, discoveredVia: "seed", status: 200, outboundLinks: [] },
      { url: "https://example.com/about", slug: "about", title: "About", depth: 1, discoveredVia: "link", status: 200, outboundLinks: [] },
    ],
    errors: [],
  }, null, 2));
  mkdirSync(join(target, ".migration/library"), { recursive: true });
  writeFileSync(join(target, ".migration/library/routes.json"), JSON.stringify({
    updatedAt: "2026-05-07T00:00:00.000Z",
    routes: [
      { sourceUrl: "https://example.com/", nextRoute: "/", params: {}, kind: "static" },
      { sourceUrl: "https://example.com/about", nextRoute: "/about", params: {}, kind: "static" },
    ],
  }, null, 2));
}

describe("resolvePolishScope", () => {
  it("resolves --all to every routed crawled page", async () => {
    const target = makeTarget();
    await writeMigrationState(target);

    const scope = resolvePolishScope({ targetDir: target, scope: "all" });

    expect(scope.valid).toBe(true);
    if (scope.valid) expect(scope.pages.map(page => page.slug)).toEqual(["home", "about"]);
  });

  it("resolves one slug and rejects missing slugs", async () => {
    const target = makeTarget();
    await writeMigrationState(target);

    const about = resolvePolishScope({ targetDir: target, scope: "about" });
    expect(about.valid).toBe(true);
    if (about.valid) expect(about.pages.map(page => page.sourceUrl)).toEqual(["https://example.com/about"]);

    const missing = resolvePolishScope({ targetDir: target, scope: "missing" });
    expect(missing.valid).toBe(false);
    if (!missing.valid) expect(missing.reason).toContain("No migrated page found for slug");
  });
});

describe("runVisualPolish", () => {
  it("creates a dedicated polish run and verifies all scoped pages at all viewports", async () => {
    const target = makeTarget();
    await writeMigrationState(target);
    const verifyVisual = vi.fn(async () => ({ passed: true, sections: [{ index: 0, label: "hero", diffPercent: 0.4, passed: true }] }));

    const result = await runVisualPolish({ targetDir: target, scope: "all", mcpAvailable: true, verifyVisual });

    expect(result.kind).toBe("completed");
    expect(result.runDir).toBe("002-polish-all");
    expect(verifyVisual).toHaveBeenCalledTimes(2 * VISUAL_POLISH_VIEWPORTS.length);
    expect(existsSync(join(target, ".migration/runs/002-polish-all/phase-6-visual/VERIFICATION.md"))).toBe(true);
    expect(existsSync(join(target, ".migration/pages/home/diffs/375/summary.json"))).toBe(true);
    const runMd = readFileSync(join(target, ".migration/runs/002-polish-all/RUN.md"), "utf8");
    expect(runMd).toContain("Run type: polish");
  });

  it("dispatches visual agents for failing sections and passes after one retry", async () => {
    const target = makeTarget();
    await writeMigrationState(target);
    const verifyVisual = vi.fn()
      .mockResolvedValueOnce({ passed: false, sections: [{ index: 0, label: "hero", diffPercent: 4.2, passed: false }] })
      .mockResolvedValueOnce({ passed: true, sections: [{ index: 0, label: "hero", diffPercent: 0.7, passed: true }] })
      .mockResolvedValue({ passed: true, sections: [{ index: 0, label: "section", diffPercent: 0.5, passed: true }] });
    const dispatchVisualAgent = vi.fn(async (_args: unknown) => ({ status: "pass" as const, summary: "fixed hero" }));

    const result = await runVisualPolish({ targetDir: target, scope: "home", mcpAvailable: true, verifyVisual, dispatchVisualAgent });

    expect(result.kind).toBe("completed");
    expect(dispatchVisualAgent).toHaveBeenCalledOnce();
    expect(dispatchVisualAgent.mock.calls[0][0]).toMatchObject({ pageSlug: "home", sectionIndex: 0, viewport: VISUAL_POLISH_VIEWPORTS[0] });
  });

  it("fails the gate when failures remain after max retries", async () => {
    const target = makeTarget();
    await writeMigrationState(target);
    const verifyVisual = vi.fn(async () => ({ passed: false, sections: [{ index: 0, label: "hero", diffPercent: 3.1, passed: false }] }));
    const dispatchVisualAgent = vi.fn(async () => ({ status: "fail" as const, summary: "still off" }));

    const result = await runVisualPolish({ targetDir: target, scope: "home", mcpAvailable: true, verifyVisual, dispatchVisualAgent, maxRetries: 1 });

    expect(result.kind).toBe("failed");
    expect(existsSync(join(target, ".migration/runs/002-polish-home/phase-6-visual/VERIFICATION.md"))).toBe(false);
    const verification = JSON.parse(readFileSync(join(target, ".migration/runs/002-polish-home/phase-6-visual/verification.json"), "utf8"));
    expect(verification.passed).toBe(false);
  });

  it("fails before verification when MCP capability is unavailable", async () => {
    const target = makeTarget();
    await writeMigrationState(target);
    const verifyVisual = vi.fn(async () => ({ passed: true, sections: [] }));

    const result = await runVisualPolish({ targetDir: target, scope: "home", mcpAvailable: false, verifyVisual });

    expect(result.kind).toBe("failed");
    expect(verifyVisual).not.toHaveBeenCalled();
    const verification = JSON.parse(readFileSync(join(target, ".migration/runs/002-polish-home/phase-6-visual/verification.json"), "utf8"));
    expect(verification.criteria[0]).toMatchObject({ name: "Playwright MCP visual agent capability available", passed: false });
  });
});
