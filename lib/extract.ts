import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractPage, type ExtractStep } from "./extract-runner.ts";
import { runValidateExtraction, type RunResult } from "./validate-extraction-runner.ts";
import { runQualifyExtraction, type QualifyResult } from "./qualify-extraction-runner.ts";
import { buildComponentUsage } from "./component-usage.ts";
import { loadSite } from "./load-site.ts";
import { loadCrawl } from "./load-crawl.ts";
import { loadProbe } from "./load-probe.ts";
import { loadComponents } from "./load-components.ts";
import { loadRoutes } from "./load-routes.ts";
import { writePlan, writeExecution, writeVerification } from "./phase-state.ts";
import type { PageSpecManifest } from "../schemas/page-spec.ts";

export interface RunExtractArgs {
  targetDir: string;
  runDir: string;
  pluginRoot?: string;
  extractOne?: (args: {
    url: string;
    slug: string;
    pagesDir: string;
    adapterPath: string;
  }) => Promise<PageSpecManifest>;
  validateExtraction?: (args: { specDirs: string[] }) => Promise<RunResult>;
  qualifyExtraction?: (args: {
    pages: { url: string; specDir: string }[];
    adapterPath: string;
  }) => Promise<QualifyResult>;
}

export async function runExtract(args: RunExtractArgs): Promise<void> {
  const phaseDir = join(args.targetDir, ".migration/runs", args.runDir, "phase-4-extract");
  const extractionDir = join(phaseDir, "extraction");
  mkdirSync(extractionDir, { recursive: true });

  await writePlan(
    phaseDir,
    `# Phase 4 — Extract\n\nExtract per-page styles, images, animations into pages/[slug]/spec/.\n`,
  );

  const fail = (criteria: { name: string; passed: boolean; detail?: string }[]) =>
    writeVerification(phaseDir, {
      phase: "phase-4-extract",
      passed: false,
      checkedAt: new Date().toISOString(),
      criteria,
    });

  // Load preconditions
  const siteResult = loadSite(join(args.targetDir, ".migration/SITE.md"));
  if (!siteResult.valid) { await fail([{ name: "SITE.md valid", passed: false }]); return; }

  const crawlPath = join(args.targetDir, ".migration/runs", args.runDir, "phase-1-discover/discovery/crawl.json");
  const crawlResult = loadCrawl(crawlPath);
  if (!crawlResult.valid) { await fail([{ name: "crawl.json valid", passed: false }]); return; }

  const probePath = join(args.targetDir, ".migration/runs", args.runDir, "phase-1-discover/discovery/probe.json");
  const probeResult = loadProbe(probePath);
  if (!probeResult.valid) { await fail([{ name: "probe.json valid", passed: false }]); return; }

  const libDir = join(args.targetDir, ".migration/library");
  const componentsResult = loadComponents(join(libDir, "components.json"));
  if (!componentsResult.valid) { await fail([{ name: "components.json valid", passed: false }]); return; }
  const componentsRegistry = componentsResult.data;
  const routesResult = loadRoutes(join(libDir, "routes.json"));
  if (!routesResult.valid) { await fail([{ name: "routes.json valid", passed: false }]); return; }
  const routes = routesResult.data.routes;

  // Build per-URL adapter map from probe
  const adapterByUrl = new Map<string, string>();
  for (const p of probeResult.data.pages) {
    if (p.matchedAdapters[0]) adapterByUrl.set(p.url, p.matchedAdapters[0]);
  }

  // Build per-URL slug map from crawl
  const slugByUrl = new Map<string, string>();
  for (const p of crawlResult.data.pages) slugByUrl.set(p.url, p.slug);

  const pagesDir = join(args.targetDir, ".migration/pages");
  mkdirSync(pagesDir, { recursive: true });

  const extractOne = args.extractOne ?? (a => extractPage(a));
  const maxParallel = siteResult.site.maxParallelPages;
  const manifests: PageSpecManifest[] = [];
  const extractFailures: { url: string; detail: string }[] = [];

  // Bounded-concurrency loop
  const queue = [...routes];
  async function worker() {
    while (queue.length > 0) {
      const route = queue.shift();
      if (!route) return;
      const slug = slugByUrl.get(route.sourceUrl);
      const adapterPath = adapterByUrl.get(route.sourceUrl);
      if (!slug || !adapterPath) {
        extractFailures.push({ url: route.sourceUrl, detail: "missing slug or adapter mapping" });
        continue;
      }
      try {
        const manifest = await extractOne({ url: route.sourceUrl, slug, pagesDir, adapterPath });
        manifests.push(manifest);
        // Build component-usage from extracted structure
        const stylesPath = join(pagesDir, slug, "spec/styles.json");
        if (existsSync(stylesPath)) {
          const styles = JSON.parse(readFileSync(stylesPath, "utf8"));
          const sections = Array.isArray(styles?.sections)
            ? styles.sections.map((s: { tagSkeleton?: string }, i: number) => ({
                index: i,
                tagSkeleton: s.tagSkeleton ?? "",
              }))
            : [];
          const usage = buildComponentUsage({
            url: route.sourceUrl,
            slug,
            sections,
            registry: componentsRegistry,
          });
          writeFileSync(
            join(pagesDir, slug, "component-usage.json"),
            JSON.stringify(usage, null, 2),
          );
        }
      } catch (err) {
        extractFailures.push({ url: route.sourceUrl, detail: (err as Error).message });
      }
    }
  }
  const workerCount = Math.min(maxParallel, queue.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  writeFileSync(join(extractionDir, "manifest.json"), JSON.stringify(manifests, null, 2));
  if (extractFailures.length > 0) {
    writeFileSync(join(extractionDir, "failures.json"), JSON.stringify(extractFailures, null, 2));
  }
  await writeExecution(phaseDir, `Extracted ${manifests.length} pages, ${extractFailures.length} failures.`);

  // Validate
  const specDirs = manifests.map(m => join(pagesDir, m.slug, "spec"));
  const validateImpl = args.validateExtraction ?? ((a: { specDirs: string[] }) => runValidateExtraction({ specDirs: a.specDirs, pluginRoot: args.pluginRoot }));
  const validate = await validateImpl({ specDirs });

  // Qualify (uses any adapter — first one available)
  const firstAdapter = [...adapterByUrl.values()][0] ?? "";
  const qualifyImpl = args.qualifyExtraction ?? ((a: { pages: { url: string; specDir: string }[]; adapterPath: string }) =>
    runQualifyExtraction({ pages: a.pages, adapterPath: a.adapterPath, pluginRoot: args.pluginRoot }));
  const qualify = await qualifyImpl({
    pages: manifests.map(m => ({ url: m.url, specDir: join(pagesDir, m.slug, "spec") })),
    adapterPath: firstAdapter,
  });
  await writeExecution(phaseDir, `validate-extraction: ${validate.passed ? "PASS" : "FAIL"}; qualify-extraction: ${qualify.passed ? "PASS" : `FAIL (${qualify.failures.length} pages)`}.`);

  // Gate
  const everyPageExtracted = manifests.length === routes.length && extractFailures.length === 0;
  const everyUsageReferencesKnownComponent = manifests.every(m => {
    const usagePath = join(pagesDir, m.slug, "component-usage.json");
    if (!existsSync(usagePath)) return false;
    const usage = JSON.parse(readFileSync(usagePath, "utf8"));
    const knownIds = new Set(componentsRegistry.components.map(c => c.id));
    return usage.components.every((c: { id: string }) => knownIds.has(c.id));
  });

  await writeVerification(phaseDir, {
    phase: "phase-4-extract",
    passed: everyPageExtracted && validate.passed && qualify.passed && everyUsageReferencesKnownComponent,
    checkedAt: new Date().toISOString(),
    criteria: [
      {
        name: "every page in routes.json was extracted",
        passed: everyPageExtracted,
        detail: extractFailures.length > 0 ? `${extractFailures.length} extraction failures` : undefined,
      },
      {
        name: "validate-extraction.ts passed (no duplicate spec hashes)",
        passed: validate.passed,
        detail: validate.detail,
      },
      {
        name: "qualify-extraction.ts passed for every page",
        passed: qualify.passed,
        detail: qualify.failures.length > 0 ? `${qualify.failures.length} pages failed: ${qualify.failures.map(f => f.url).join(", ")}` : undefined,
      },
      {
        name: "every component-usage.json references known components",
        passed: everyUsageReferencesKnownComponent,
      },
    ],
  });
}

export type { ExtractStep };
