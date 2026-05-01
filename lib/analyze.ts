import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runDiscoverSections } from "./discover-sections-runner.ts";
import { loadCrawl } from "./load-crawl.ts";
import { loadSections } from "./load-sections.ts";
import { clusterSections, type SectionInput } from "./cluster.ts";
import { buildRoutes } from "./route-map.ts";
import { appendLibraryHistory } from "./library-history.ts";
import { writePlan, writeExecution, writeVerification } from "./phase-state.ts";
import type { Layouts, LayoutShell } from "../schemas/layouts.ts";
import type { ComponentEntry } from "../schemas/components.ts";
import type { PropsRegistry } from "../schemas/props.ts";

export interface RunAnalyzeArgs {
  targetDir: string;
  runDir: string;
  primarySelector: string;
  skipSelectors?: string[];
  pluginRoot?: string;
  discoverSections?: (args: {
    urls: string[];
    primarySelector: string;
    skipSelectors?: string[];
    outputPath: string;
  }) => Promise<void>;
  autoMergeThreshold?: number;
  ambiguousThreshold?: number;
}

const DEFAULT_AUTO_MERGE = 0.85;
const DEFAULT_AMBIGUOUS = 0.6;

export async function runAnalyze(args: RunAnalyzeArgs): Promise<void> {
  const phaseDir = join(args.targetDir, ".migration/runs", args.runDir, "phase-2-analyze");
  const analysisDir = join(phaseDir, "analysis");
  const libraryDir = join(args.targetDir, ".migration/library");
  mkdirSync(analysisDir, { recursive: true });
  mkdirSync(libraryDir, { recursive: true });

  await writePlan(
    phaseDir,
    `# Phase 2 — Analyze\n\nCluster sections across crawled pages and emit the shared component library.\n\nautoMergeThreshold=${args.autoMergeThreshold ?? DEFAULT_AUTO_MERGE} | ambiguousThreshold=${args.ambiguousThreshold ?? DEFAULT_AMBIGUOUS}\n`,
  );

  // Load Phase 1 crawl
  const crawlPath = join(args.targetDir, ".migration/runs", args.runDir, "phase-1-discover/discovery/crawl.json");
  if (!existsSync(crawlPath)) {
    await writeVerification(phaseDir, {
      phase: "phase-2-analyze", passed: false,
      checkedAt: new Date().toISOString(),
      criteria: [{ name: "crawl.json exists", passed: false, detail: `Missing ${crawlPath}` }],
    });
    return;
  }
  const crawlResult = loadCrawl(crawlPath);
  if (!crawlResult.valid) {
    await writeVerification(phaseDir, {
      phase: "phase-2-analyze", passed: false,
      checkedAt: new Date().toISOString(),
      criteria: [{ name: "crawl.json valid", passed: false, detail: crawlResult.issues[0]?.message }],
    });
    return;
  }
  const crawlUrls = crawlResult.data.pages.map(p => p.url);

  // Probe sections per URL
  const sectionsPath = join(analysisDir, "sections.json");
  const probe = args.discoverSections ?? runDiscoverSections;
  await probe({
    urls: crawlUrls,
    primarySelector: args.primarySelector,
    skipSelectors: args.skipSelectors,
    outputPath: sectionsPath,
  });
  await writeExecution(phaseDir, `Section probe complete → ${sectionsPath}`);

  const sectionsResult = loadSections(sectionsPath);
  if (!sectionsResult.valid) {
    await writeVerification(phaseDir, {
      phase: "phase-2-analyze", passed: false,
      checkedAt: new Date().toISOString(),
      criteria: [{ name: "sections.json valid", passed: false, detail: sectionsResult.issues[0]?.message }],
    });
    return;
  }

  // Cluster
  const allSections: SectionInput[] = [];
  for (const page of sectionsResult.data.pages) {
    for (const s of page.sections) {
      allSections.push({
        id: `${page.url}#${s.id}`,
        pathShingles: s.pathShingles,
        tagSkeleton: s.tagSkeleton,
        pageUrl: page.url,
      });
    }
  }
  const clusterResult = clusterSections(allSections, {
    autoMergeThreshold: args.autoMergeThreshold ?? DEFAULT_AUTO_MERGE,
    ambiguousThreshold: args.ambiguousThreshold ?? DEFAULT_AMBIGUOUS,
  });
  writeFileSync(
    join(analysisDir, "clusters.json"),
    JSON.stringify(clusterResult, null, 2),
  );
  await writeExecution(phaseDir, `Clustering complete → ${clusterResult.clusters.length} clusters, ${clusterResult.ambiguousPairs.length} ambiguous pairs.`);

  // Split clusters into layouts (header/footer/nav) vs components
  const layouts = extractLayouts(clusterResult.clusters, sectionsResult.data);
  const components = extractComponents(clusterResult.clusters, layouts);

  // Build routes from crawl URLs
  const routes = buildRoutes(crawlUrls);

  // Write library JSONs
  const now = new Date().toISOString();
  writeFileSync(join(libraryDir, "layouts.json"), JSON.stringify({ ...layouts, updatedAt: now }, null, 2));
  writeFileSync(
    join(libraryDir, "components.json"),
    JSON.stringify({ components, updatedAt: now }, null, 2),
  );
  const propsRegistry: PropsRegistry = { interfaces: components.map(c => ({ name: `${c.name}Props`, fields: [] })), updatedAt: now };
  writeFileSync(join(libraryDir, "props.json"), JSON.stringify(propsRegistry, null, 2));
  writeFileSync(join(libraryDir, "routes.json"), JSON.stringify({ routes, updatedAt: now }, null, 2));

  await appendLibraryHistory(libraryDir, {
    runDir: args.runDir,
    summary: `${components.length} components, ${routes.length} routes, ${clusterResult.unique.length} unique sections, ${clusterResult.ambiguousPairs.length} ambiguous pairs.`,
  });
  await writeExecution(phaseDir, `Library written → ${components.length} components, ${routes.length} routes.`);

  // Verification gate
  const routesCoverEveryPage = new Set(routes.map(r => r.sourceUrl)).size === new Set(crawlUrls).size;
  const everySectionAccountedFor = allSections.length > 0 &&
    allSections.every(s =>
      clusterResult.clusters.some(c => c.memberIds.includes(s.id)) ||
      clusterResult.unique.some(u => u.id === s.id)
    );

  await writeVerification(phaseDir, {
    phase: "phase-2-analyze",
    passed: routesCoverEveryPage && everySectionAccountedFor,
    checkedAt: new Date().toISOString(),
    criteria: [
      { name: "every page in crawl.json has an entry in routes.json", passed: routesCoverEveryPage },
      { name: "every section belongs to a cluster or is marked unique", passed: everySectionAccountedFor },
    ],
  });
}

// Match agents/layout-extractor.md rule: shell qualifies at >= 80% page coverage.
// Use distinct page count (memberIds may exceed totalPages when a cluster
// captures multiple matching elements per page).
const LAYOUT_COVERAGE_THRESHOLD = 0.8;

function extractLayouts(
  clusters: ReturnType<typeof clusterSections>["clusters"],
  sections: { pages: { url: string }[] },
): Layouts {
  const totalPages = sections.pages.length;
  const minPages = Math.ceil(totalPages * LAYOUT_COVERAGE_THRESHOLD);

  const findShell = (prefix: string): LayoutShell | null => {
    let best: { cluster: typeof clusters[number]; pageCount: number } | null = null;
    for (const c of clusters) {
      if (!c.representative.tagSkeleton.startsWith(prefix)) continue;
      const distinctPages = new Set(c.memberIds.map(id => id.split("#")[0])).size;
      if (distinctPages < minPages) continue;
      if (!best || distinctPages > best.pageCount) {
        best = { cluster: c, pageCount: distinctPages };
      }
    }
    if (!best) return null;
    return {
      id: best.cluster.id,
      signature: best.cluster.id.replace(/^cluster-/, ""),
      appearsOn: dedupeUrls(best.cluster.memberIds.map(id => id.split("#")[0])),
      tagSkeleton: best.cluster.representative.tagSkeleton,
    };
  };
  return {
    header: findShell("header"),
    footer: findShell("footer"),
    nav: findShell("nav"),
    updatedAt: new Date().toISOString(),
  };
}

function extractComponents(
  clusters: ReturnType<typeof clusterSections>["clusters"],
  layouts: Layouts,
): ComponentEntry[] {
  const layoutIds = new Set([layouts.header?.id, layouts.footer?.id, layouts.nav?.id].filter(Boolean));
  return clusters
    .filter(c => !layoutIds.has(c.id))
    .map(c => {
      const memberSections = c.memberIds.map(id => {
        const [url, sid] = id.split("#");
        return { id: sid, url };
      });
      return {
        id: c.id,
        name: nameFromSkeleton(c.representative.tagSkeleton),
        signature: c.id.replace(/^cluster-/, ""),
        tagSkeleton: c.representative.tagSkeleton,
        memberSections,
        unique: c.memberIds.length === 1,
        propsRef: null,
      };
    });
}

function nameFromSkeleton(skeleton: string): string {
  // Cheap derivation. The component-deduper agent improves these names later.
  const root = skeleton.split(">")[0] ?? "Section";
  return root.charAt(0).toUpperCase() + root.slice(1);
}

function dedupeUrls(urls: string[]): string[] {
  return [...new Set(urls)];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const get = (flag: string) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const targetDir = get("--target") ?? process.cwd();
  const runDir = get("--run") ?? "001-initial";
  const primarySelector = get("--selector") ?? "body > *";
  runAnalyze({ targetDir, runDir, primarySelector })
    .then(() => { console.log(`Analyze phase complete for run ${runDir}.`); })
    .catch(err => { console.error(err.message); process.exit(1); });
}
