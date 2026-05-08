// RECOVERY USE ONLY: legacy phase entry point retained for maintainer/debug workflows; normal migrations use guided approvals.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadCrawl } from "./load-crawl.ts";
import { loadLayouts } from "./load-layouts.ts";
import { loadComponents } from "./load-components.ts";
import { loadRoutes } from "./load-routes.ts";
import { loadSite } from "./load-site.ts";
import { buildOrder, detectCycles } from "./build-order.ts";
import { requireRecoveryTargetArg } from "./recovery-cli.ts";
import { writePlan, writeExecution, writeVerification } from "./phase-state.ts";
import { stringifyFrontmatter } from "./frontmatter.ts";
import type { Roadmap, RoadmapItem } from "../schemas/roadmap.ts";

export interface RunPlanArgs {
  targetDir: string;
  runDir: string;
}

export async function runPlan(args: RunPlanArgs): Promise<void> {
  const phaseDir = join(args.targetDir, ".migration/runs", args.runDir, "phase-3-plan");
  mkdirSync(phaseDir, { recursive: true });

  await writePlan(
    phaseDir,
    `# Phase 3 — Plan\n\nSynthesize crawl + library into an ordered build roadmap.\n`,
  );

  const fail = (criteria: { name: string; passed: boolean; detail?: string }[]) =>
    writeVerification(phaseDir, {
      phase: "phase-3-plan",
      passed: false,
      checkedAt: new Date().toISOString(),
      criteria,
    });

  const siteResult = loadSite(join(args.targetDir, ".migration/SITE.md"));
  if (!siteResult.valid) {
    await fail([{ name: "SITE.md valid", passed: false, detail: siteResult.issues[0]?.message }]);
    return;
  }
  const site = siteResult.site;

  const crawlPath = join(args.targetDir, ".migration/runs", args.runDir, "phase-1-discover/discovery/crawl.json");
  if (!existsSync(crawlPath)) {
    await fail([{ name: "crawl.json exists", passed: false, detail: `Missing ${crawlPath}` }]);
    return;
  }
  const crawlResult = loadCrawl(crawlPath);
  if (!crawlResult.valid) {
    await fail([{ name: "crawl.json valid", passed: false, detail: crawlResult.issues[0]?.message }]);
    return;
  }

  const libDir = join(args.targetDir, ".migration/library");
  const layoutsResult = loadLayouts(join(libDir, "layouts.json"));
  if (!layoutsResult.valid) {
    await fail([{ name: "layouts.json valid", passed: false, detail: layoutsResult.issues[0]?.message }]);
    return;
  }
  const componentsResult = loadComponents(join(libDir, "components.json"));
  if (!componentsResult.valid) {
    await fail([{ name: "components.json valid", passed: false, detail: componentsResult.issues[0]?.message }]);
    return;
  }
  const routesResult = loadRoutes(join(libDir, "routes.json"));
  if (!routesResult.valid) {
    await fail([{ name: "routes.json valid", passed: false, detail: routesResult.issues[0]?.message }]);
    return;
  }

  const items = buildOrder({
    layouts: layoutsResult.data,
    components: componentsResult.data,
    routes: routesResult.data,
  });
  await writeExecution(phaseDir, `Build order computed: ${items.length} items.`);

  const roadmap: Roadmap = {
    buildOrder: items,
    parallelism: {
      maxParallelPages: site.maxParallelPages,
      maxParallelSections: site.maxParallelSections,
    },
    resolvedQuestions: [],
    generatedAt: new Date().toISOString(),
  };

  const roadmapPath = join(args.targetDir, ".migration/runs", args.runDir, "ROADMAP.md");
  writeFileSync(roadmapPath, renderRoadmapMd(roadmap));
  await writeExecution(phaseDir, `Roadmap written → ${roadmapPath}`);

  await emitGate({
    phaseDir,
    items,
    crawlUrls: crawlResult.data.pages.map(p => p.url),
    layouts: layoutsResult.data,
    components: componentsResult.data,
    routes: routesResult.data,
  });
}

/**
 * Re-run the gate against an already-written ROADMAP.md without rebuilding
 * the build-order or rewriting ROADMAP.md. Used by recovery flows after the
 * migration-planner / plan-checker agents have refined the roadmap.
 */
export async function runPlanRefineOnly(args: {
  targetDir: string;
  runDir: string;
}): Promise<void> {
  const phaseDir = join(args.targetDir, ".migration/runs", args.runDir, "phase-3-plan");
  const fail = (criteria: { name: string; passed: boolean; detail?: string }[]) =>
    writeVerification(phaseDir, {
      phase: "phase-3-plan",
      passed: false,
      checkedAt: new Date().toISOString(),
      criteria,
    });

  const siteResult = loadSite(join(args.targetDir, ".migration/SITE.md"));
  if (!siteResult.valid) {
    await fail([{ name: "SITE.md valid", passed: false }]);
    return;
  }
  const crawlPath = join(args.targetDir, ".migration/runs", args.runDir, "phase-1-discover/discovery/crawl.json");
  const crawlResult = loadCrawl(crawlPath);
  if (!crawlResult.valid) {
    await fail([{ name: "crawl.json valid", passed: false }]);
    return;
  }
  const libDir = join(args.targetDir, ".migration/library");
  const layoutsResult = loadLayouts(join(libDir, "layouts.json"));
  const componentsResult = loadComponents(join(libDir, "components.json"));
  const routesResult = loadRoutes(join(libDir, "routes.json"));
  if (!layoutsResult.valid || !componentsResult.valid || !routesResult.valid) {
    await fail([{ name: "library JSONs valid", passed: false }]);
    return;
  }
  const roadmapPath = join(args.targetDir, ".migration/runs", args.runDir, "ROADMAP.md");
  if (!existsSync(roadmapPath)) {
    await fail([{ name: "ROADMAP.md exists", passed: false, detail: `Missing ${roadmapPath}` }]);
    return;
  }
  const { loadRoadmap } = await import("./load-roadmap.ts");
  const roadmapResult = loadRoadmap(roadmapPath);
  if (!roadmapResult.valid) {
    await fail([{ name: "ROADMAP.md frontmatter valid", passed: false, detail: roadmapResult.issues[0]?.message }]);
    return;
  }

  await writeExecution(phaseDir, "Refine-only re-verification.");
  await emitGate({
    phaseDir,
    items: roadmapResult.data.buildOrder,
    crawlUrls: crawlResult.data.pages.map(p => p.url),
    layouts: layoutsResult.data,
    components: componentsResult.data,
    routes: routesResult.data,
  });
}

function renderRoadmapMd(roadmap: Roadmap): string {
  const body = renderRoadmapBody(roadmap);
  return stringifyFrontmatter(roadmap as unknown as Record<string, unknown>, body);
}

function renderRoadmapBody(roadmap: Roadmap): string {
  const lines: string[] = [
    "# Roadmap",
    "",
    `Generated at ${roadmap.generatedAt}.`,
    "",
    "## Build order",
    "",
  ];
  for (const item of roadmap.buildOrder) {
    const deps = item.dependsOn.length > 0 ? ` (depends on: ${item.dependsOn.join(", ")})` : "";
    const note = item.notes ? ` — ${item.notes}` : "";
    lines.push(`- **${item.kind}** \`${item.id}\` — ${item.name}${deps}${note}`);
  }
  if (roadmap.resolvedQuestions.length > 0) {
    lines.push("", "## Resolved clarifying questions", "");
    for (const q of roadmap.resolvedQuestions) {
      lines.push(`- **${q.question}** ${q.answer}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

async function emitGate(args: {
  phaseDir: string;
  items: RoadmapItem[];
  crawlUrls: string[];
  layouts: import("../schemas/layouts.ts").Layouts;
  components: import("../schemas/components.ts").Components;
  routes: import("../schemas/routes.ts").Routes;
}): Promise<void> {
  const buildOrderIds = new Set(args.items.map(i => i.id));
  const routesUrls = new Set(args.routes.routes.map(r => r.sourceUrl));

  const everyCrawlPageInRoutes = args.crawlUrls.every(url => routesUrls.has(url));
  const everyComponentHasEntry = args.components.components.every(c => buildOrderIds.has(c.id));
  const layoutShellIds = (["header", "footer", "nav"] as const)
    .map(slot => args.layouts[slot]?.id)
    .filter((id): id is string => Boolean(id));
  const everyLayoutShellHasEntry = layoutShellIds.every(id => buildOrderIds.has(id));
  const cycles = detectCycles(args.items);
  const acyclic = cycles.length === 0;

  await writeVerification(args.phaseDir, {
    phase: "phase-3-plan",
    passed: everyCrawlPageInRoutes && everyComponentHasEntry && everyLayoutShellHasEntry && acyclic,
    checkedAt: new Date().toISOString(),
    criteria: [
      {
        name: "every page in crawl.json has an entry in routes.json",
        passed: everyCrawlPageInRoutes,
        detail: everyCrawlPageInRoutes ? undefined :
          `Missing in routes.json: ${args.crawlUrls.filter(u => !routesUrls.has(u)).join(", ")}`,
      },
      {
        name: "every component in components.json has a build-order entry",
        passed: everyComponentHasEntry,
      },
      {
        name: "every non-null layout slot has a build-order entry",
        passed: everyLayoutShellHasEntry,
      },
      {
        name: "build-order is acyclic",
        passed: acyclic,
        detail: acyclic ? undefined : `Cycles: ${cycles.map(c => c.join(" -> ")).join("; ")}`,
      },
    ],
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const get = (flag: string) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const refineOnly = process.argv.includes("--refine-only");
  const targetDir = requireRecoveryTargetArg();
  const runDir = get("--run") ?? "001-initial";
  const work = refineOnly
    ? runPlanRefineOnly({ targetDir, runDir })
        .then(() => `Plan refine-only re-verification complete for run ${runDir}.`)
    : runPlan({ targetDir, runDir })
        .then(() => `Plan phase complete for run ${runDir}.`);
  work
    .then(msg => { console.log(msg); })
    .catch(err => { console.error(err.message); process.exit(1); });
}
