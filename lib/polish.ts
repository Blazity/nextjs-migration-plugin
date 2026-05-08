// RECOVERY USE ONLY: legacy phase entry point retained for maintainer/debug workflows; normal migrations use guided approvals.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadSite } from "./load-site.ts";
import { loadCrawl } from "./load-crawl.ts";
import { loadRoutes } from "./load-routes.ts";
import { requireRecoveryTargetArg } from "./recovery-cli.ts";
import { writeExecution, writePlan, writeVerification } from "./phase-state.ts";
import { appendSessionLog } from "./session-log.ts";

export const VISUAL_POLISH_VIEWPORTS = [
  { label: "375", width: 375, height: 812 },
  { label: "768", width: 768, height: 1024 },
  { label: "1024", width: 1024, height: 768 },
  { label: "1440", width: 1440, height: 900 },
] as const;

export type VisualPolishViewport = typeof VISUAL_POLISH_VIEWPORTS[number];
export type PolishScope = "all" | string;

export interface PolishPage {
  slug: string;
  sourceUrl: string;
  nextRoute: string;
}

export type PolishScopeResult =
  | { valid: true; pages: PolishPage[]; baseRunDir: string }
  | { valid: false; reason: string; baseRunDir?: string };

export interface VisualSectionResult {
  index: number;
  label: string;
  diffPercent: number;
  passed: boolean;
  diffPath?: string;
}

export interface VisualVerificationResult {
  passed: boolean;
  sections: VisualSectionResult[];
  detail?: string;
}

export interface VisualAgentResult {
  status: "pass" | "fail";
  summary: string;
}

export interface VerifyVisualArgs {
  targetDir: string;
  runDir: string;
  pageSlug: string;
  sourceUrl: string;
  nextRoute: string;
  viewport: VisualPolishViewport;
  localPort: number;
  maxDiffPercent: number;
  diffDir: string;
}

export interface DispatchVisualAgentArgs extends VerifyVisualArgs {
  sectionIndex: number;
  sectionLabel: string;
  currentDiffPercent: number;
  attempt: number;
}

export interface RunVisualPolishArgs {
  targetDir: string;
  scope: PolishScope;
  mcpAvailable: boolean;
  verifyVisual?: (args: VerifyVisualArgs) => Promise<VisualVerificationResult>;
  dispatchVisualAgent?: (args: DispatchVisualAgentArgs) => Promise<VisualAgentResult>;
  maxRetries?: number;
  maxDiffPercent?: number;
}

export type RunVisualPolishResult =
  | { kind: "completed"; runDir: string; pages: PolishPage[] }
  | { kind: "failed"; runDir: string; reason: string; pages: PolishPage[] };

export function resolvePolishScope(args: { targetDir: string; scope: PolishScope }): PolishScopeResult {
  const migrationDir = join(args.targetDir, ".migration");
  const baseRunDir = findLatestRunWithPhase5(args.targetDir);
  if (!baseRunDir) return { valid: false, reason: "Phase 5 must complete before visual polish." };

  const crawlResult = loadCrawl(join(migrationDir, "runs", baseRunDir, "phase-1-discover/discovery/crawl.json"));
  if (!crawlResult.valid) return { valid: false, reason: "crawl.json is invalid for the Phase 5 base run.", baseRunDir };
  const routesResult = loadRoutes(join(migrationDir, "library/routes.json"));
  if (!routesResult.valid) return { valid: false, reason: "routes.json is invalid.", baseRunDir };

  const pageByUrl = new Map(crawlResult.data.pages.map(page => [page.url, page]));
  const pages = routesResult.data.routes.flatMap(route => {
    const page = pageByUrl.get(route.sourceUrl);
    return page ? [{ slug: page.slug, sourceUrl: route.sourceUrl, nextRoute: route.nextRoute }] : [];
  });

  if (args.scope === "all") return { valid: true, pages, baseRunDir };

  const match = pages.find(page => page.slug === args.scope || page.nextRoute.replace(/^\//, "") === args.scope);
  if (!match) return { valid: false, reason: `No migrated page found for slug "${args.scope}".`, baseRunDir };
  return { valid: true, pages: [match], baseRunDir };
}

export async function runVisualPolish(args: RunVisualPolishArgs): Promise<RunVisualPolishResult> {
  if (!existsSync(join(args.targetDir, ".migration/SITE.md"))) {
    return {
      kind: "failed",
      runDir: "",
      reason: "No migration here. Run `/migrate:new <url>` first.",
      pages: [],
    };
  }

  const scopeResult = resolvePolishScope({ targetDir: args.targetDir, scope: args.scope });
  const pages = scopeResult.valid ? scopeResult.pages : [];
  const runDir = createOrReusePolishRun({
    targetDir: args.targetDir,
    scope: args.scope,
    pages,
    baseRunDir: scopeResult.baseRunDir ?? "unknown",
  });
  const phaseDir = join(args.targetDir, ".migration/runs", runDir, "phase-6-visual");
  mkdirSync(phaseDir, { recursive: true });

  await writePlan(
    phaseDir,
    [
      "# Phase 6 — Visual Polish",
      "",
      "Run live browser visual parity across 375, 768, 1024, and 1440px.",
      "Phase 7 Animate and Phase 8 Perf remain pending follow-up phases.",
      "",
    ].join("\n"),
  );

  if (!scopeResult.valid) {
    await failPhase(phaseDir, scopeResult.reason, [
      { name: "polish scope resolved", passed: false, detail: scopeResult.reason },
    ]);
    return { kind: "failed", runDir, reason: scopeResult.reason, pages };
  }

  if (!args.mcpAvailable) {
    const reason = "Playwright MCP visual agent capability is required for Phase 6 visual polish.";
    await failPhase(phaseDir, reason, [
      { name: "Playwright MCP visual agent capability available", passed: false, detail: reason },
      { name: "polish scope resolved", passed: true, detail: `${pages.length} page(s)` },
    ]);
    return { kind: "failed", runDir, reason, pages };
  }

  const verifyVisual = args.verifyVisual ?? defaultUnavailableVerifier;
  const maxRetries = args.maxRetries ?? 2;
  const maxDiffPercent = args.maxDiffPercent ?? 1;
  const failures: string[] = [];
  const executionLines: string[] = [];

  for (const page of pages) {
    for (const viewport of VISUAL_POLISH_VIEWPORTS) {
      const result = await verifyWithRetries({
        targetDir: args.targetDir,
        runDir,
        page,
        viewport,
        verifyVisual,
        dispatchVisualAgent: args.dispatchVisualAgent,
        maxRetries,
        maxDiffPercent,
        maxParallelSections: maxParallelSections(args.targetDir),
      });
      writePageViewportSummary(args.targetDir, page.slug, viewport, result.finalVerification);
      executionLines.push(`${page.slug} @ ${viewport.label}: ${result.finalVerification.passed ? "passed" : "failed"} after ${result.attempts} retry attempt(s).`);
      if (!result.finalVerification.passed) {
        failures.push(`${page.slug} @ ${viewport.label}: ${result.finalVerification.detail ?? "visual diff remains above threshold"}`);
      }
    }
  }

  await writeExecution(
    phaseDir,
    [
      `Visual polish scope: ${pages.map(page => page.slug).join(", ")}`,
      "",
      ...executionLines,
      "",
      "Phase 7 Animate and Phase 8 Perf remain pending.",
    ].join("\n"),
  );
  appendSessionLog({
    targetDir: args.targetDir,
    title: "Phase 6 visual polish",
    body: failures.length === 0 ? `Visual polish passed for ${pages.length} page(s).` : `Visual polish failed: ${failures.join("; ")}`,
  });

  const passed = failures.length === 0 && pages.length > 0;
  await writeVerification(phaseDir, {
    phase: "phase-6-visual",
    passed,
    checkedAt: new Date().toISOString(),
    criteria: [
      { name: "Phase 5 build verified before polish", passed: true, detail: scopeResult.baseRunDir },
      { name: "Playwright MCP visual agent capability available", passed: true },
      { name: "polish scope resolved", passed: pages.length > 0, detail: `${pages.length} page(s)` },
      { name: "all scoped pages are below visual threshold at all viewports", passed, detail: passed ? `<= ${maxDiffPercent}%` : failures.join("; ") },
    ],
    notes: "Phase 6 Visual only. Phase 7 Animate and Phase 8 Perf remain pending follow-up phases.",
  });

  if (!passed) return { kind: "failed", runDir, reason: failures.join("; "), pages };
  return { kind: "completed", runDir, pages };
}

async function verifyWithRetries(args: {
  targetDir: string;
  runDir: string;
  page: PolishPage;
  viewport: VisualPolishViewport;
  verifyVisual: (args: VerifyVisualArgs) => Promise<VisualVerificationResult>;
  dispatchVisualAgent?: (args: DispatchVisualAgentArgs) => Promise<VisualAgentResult>;
  maxRetries: number;
  maxDiffPercent: number;
  maxParallelSections: number;
}): Promise<{ finalVerification: VisualVerificationResult; attempts: number }> {
  const verifyArgs = {
    targetDir: args.targetDir,
    runDir: args.runDir,
    pageSlug: args.page.slug,
    sourceUrl: args.page.sourceUrl,
    nextRoute: args.page.nextRoute,
    viewport: args.viewport,
    localPort: 3000,
    maxDiffPercent: args.maxDiffPercent,
    diffDir: join(args.targetDir, ".migration/pages", args.page.slug, "diffs", args.viewport.label),
  };

  let finalVerification = await args.verifyVisual(verifyArgs);
  let attempts = 0;
  while (!finalVerification.passed && attempts < args.maxRetries) {
    const failingSections = finalVerification.sections.filter(section => !section.passed);
    if (!args.dispatchVisualAgent || failingSections.length === 0) break;
    attempts++;
    for (const chunk of chunked(failingSections, args.maxParallelSections)) {
      await Promise.all(chunk.map(section => args.dispatchVisualAgent!({
        ...verifyArgs,
        sectionIndex: section.index,
        sectionLabel: section.label,
        currentDiffPercent: section.diffPercent,
        localPort: 3000 + section.index,
        attempt: attempts,
      })));
    }
    finalVerification = await args.verifyVisual(verifyArgs);
  }
  return { finalVerification, attempts };
}

async function failPhase(
  phaseDir: string,
  reason: string,
  criteria: { name: string; passed: boolean; detail?: string }[],
): Promise<void> {
  await writeExecution(phaseDir, reason);
  await writeVerification(phaseDir, {
    phase: "phase-6-visual",
    passed: false,
    checkedAt: new Date().toISOString(),
    criteria,
    notes: "Phase 6 Visual only. Phase 7 Animate and Phase 8 Perf remain pending follow-up phases.",
  });
}

function createOrReusePolishRun(args: {
  targetDir: string;
  scope: PolishScope;
  pages: PolishPage[];
  baseRunDir: string;
}): string {
  const migrationDir = join(args.targetDir, ".migration");
  const runsDir = join(migrationDir, "runs");
  mkdirSync(runsDir, { recursive: true });
  const scopeKey = args.scope === "all" ? "all" : args.pages[0]?.slug ?? sanitizeRunSegment(args.scope);

  for (const run of sortedRuns(runsDir)) {
    const runMdPath = join(runsDir, run, "RUN.md");
    if (!existsSync(runMdPath)) continue;
    const runMd = readFileSync(runMdPath, "utf8");
    const verified = existsSync(join(runsDir, run, "phase-6-visual/VERIFICATION.md"));
    if (runMd.includes("Run type: polish") && runMd.includes(`Scope key: ${scopeKey}`) && !verified) {
      return run;
    }
  }

  const next = nextRunNumber(runsDir);
  const runDir = `${String(next).padStart(3, "0")}-polish-${scopeKey}`;
  mkdirSync(join(runsDir, runDir), { recursive: true });
  writeFileSync(
    join(runsDir, runDir, "RUN.md"),
    [
      `# Run ${String(next).padStart(3, "0")} — polish ${scopeKey}`,
      "",
      "Run type: polish",
      `Scope key: ${scopeKey}`,
      `Base run: ${args.baseRunDir}`,
      `Pages: ${args.pages.map(page => page.slug).join(", ") || "(unresolved)"}`,
      "",
      "Phase 6 Visual only. Phase 7 Animate and Phase 8 Perf remain pending.",
      "",
    ].join("\n"),
  );
  return runDir;
}

function findLatestRunWithPhase5(targetDir: string): string | null {
  const runsDir = join(targetDir, ".migration/runs");
  if (!existsSync(runsDir)) return null;
  return sortedRuns(runsDir)
    .reverse()
    .find(run => existsSync(join(runsDir, run, "phase-5-build/VERIFICATION.md"))) ?? null;
}

function sortedRuns(runsDir: string): string[] {
  if (!existsSync(runsDir)) return [];
  return readdirSync(runsDir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function nextRunNumber(runsDir: string): number {
  const numbers = sortedRuns(runsDir)
    .map(run => /^(\d+)/.exec(run)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(value => Number(value));
  return numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
}

function writePageViewportSummary(
  targetDir: string,
  slug: string,
  viewport: VisualPolishViewport,
  result: VisualVerificationResult,
): void {
  const dir = join(targetDir, ".migration/pages", slug, "diffs", viewport.label);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "summary.json"), JSON.stringify({
    viewport,
    passed: result.passed,
    detail: result.detail,
    sections: result.sections,
  }, null, 2) + "\n");
}

function maxParallelSections(targetDir: string): number {
  const siteResult = loadSite(join(targetDir, ".migration/SITE.md"));
  return siteResult.valid ? siteResult.site.maxParallelSections : 1;
}

function sanitizeRunSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "scope";
}

function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  const chunkSize = Math.max(1, size);
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

async function defaultUnavailableVerifier(): Promise<VisualVerificationResult> {
  return {
    passed: false,
    sections: [],
    detail: "No visual verifier was provided. Use the /migrate:polish skill so MCP-backed visual agents can verify and fix sections.",
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const targetDir = requireRecoveryTargetArg(process.argv);
  const scope = argv.includes("--all")
    ? "all"
    : get("--slug") ?? get("--scope") ?? positionalScope(argv) ?? "all";
  runVisualPolish({
    targetDir,
    scope,
    mcpAvailable: argv.includes("--mcp-confirmed"),
  }).then(result => {
    console.log(JSON.stringify(result, null, 2));
    if (result.kind === "failed") process.exit(1);
  }).catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}

function positionalScope(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      i++;
      continue;
    }
    return arg;
  }
  return undefined;
}
