import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadCrawl } from "./load-crawl.ts";
import { loadLayouts } from "./load-layouts.ts";
import { loadComponents } from "./load-components.ts";
import { loadRoutes } from "./load-routes.ts";
import { loadSite } from "./load-site.ts";
import { buildOrder, detectCycles } from "./build-order.ts";
import { writePlan, writeExecution, writeVerification } from "./phase-state.ts";
import { stringifyFrontmatter } from "./frontmatter.ts";
import type { Roadmap, RoadmapItem } from "../schemas/roadmap.ts";

export interface RunPlanArgs {
  targetDir: string;
  runDir: string;
  /** Auto-confirm the roadmap regardless of mode. Used by the skill after
   *  the migration-planner agent completes the LLM refinement loop. */
  confirmRoadmap?: boolean;
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
    goal: site.goal,
  });
  await writeExecution(phaseDir, `Build order computed: ${items.length} items.`);

  const roadmap: Roadmap = {
    goal: site.goal,
    mode: site.mode,
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
    mode: site.mode,
    confirmRoadmap: args.confirmRoadmap ?? false,
  });
}

function renderRoadmapMd(roadmap: Roadmap): string {
  const body = renderRoadmapBody(roadmap);
  return stringifyFrontmatter(roadmap as unknown as Record<string, unknown>, body);
}

function renderRoadmapBody(roadmap: Roadmap): string {
  const lines: string[] = [
    `# Roadmap (${roadmap.goal} | ${roadmap.mode})`,
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
  mode: string;
  confirmRoadmap: boolean;
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
  const userApproved = args.mode === "unattended" ? true : args.confirmRoadmap;

  await writeVerification(args.phaseDir, {
    phase: "phase-3-plan",
    passed: everyCrawlPageInRoutes && everyComponentHasEntry && everyLayoutShellHasEntry && acyclic && userApproved,
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
      {
        name: "user approved the roadmap",
        passed: userApproved,
        detail: args.mode === "unattended" ? "auto-confirmed (unattended mode)" :
          (args.confirmRoadmap ? "user confirmed" : "awaiting confirmation"),
      },
    ],
  });
}
