import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { PNG } from "pngjs";
import { ApprovedInventorySchema } from "../schemas/approved-inventory.ts";
import { PageAssemblyReportSchema, type PageAssemblyReport, type PageAssemblyViewportResult } from "../schemas/page-assembly-report.ts";
import { RawDiscoveryEvidenceSchema, type RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";
import { assessDiffResult, diffNormalizedPngs, type DiffAssessment, type DiffResult } from "../scripts/lib/visual-verify-core.ts";
import { hashArtifact } from "./artifact-hash.ts";
import { BrowserWorkQueue, type BrowserWorkQueueLike } from "./browser-work-queue.ts";
import { migrationPaths } from "./migration-paths.ts";
import { runNextBuild, type RunNextBuildResult } from "./next-build-runner.ts";
import { assemblePageTsx } from "./page-assembler.ts";
import { planPageAssembly } from "./page-assembly-planner.ts";
import type { ComponentVerifyViewport } from "./verify-component.ts";

const REQUIRED_VIEWPORTS = [390, 768, 1440] as const satisfies readonly ComponentVerifyViewport[];
const DEFAULT_LOCAL_BASE_URL = "http://127.0.0.1:3000";

export type PageScreenshotCapturerArgs = Readonly<{
  pageUrl: string;
  viewport: ComponentVerifyViewport;
  outputPath: string;
}>;

export interface RunPageAssemblyArgs {
  targetDir: string;
  slug: string;
  componentGroupIds: string[];
  now?: () => string;
  localBaseUrl?: string;
  browserQueue?: BrowserWorkQueueLike;
  buildProject?: (args: { targetDir: string }) => Promise<RunNextBuildResult>;
  screenshotCapturer?: (args: PageScreenshotCapturerArgs) => Promise<void> | void;
  readPng?: (path: string) => PNG;
  diffPngs?: (reference: PNG, local: PNG) => DiffResult;
  assessDiff?: typeof assessDiffResult;
  writePng?: (path: string, png: PNG) => void;
}

export interface RunPageAssemblyResult {
  reportPath: string;
  report: PageAssemblyReport;
}

export async function runPageAssembly(args: RunPageAssemblyArgs): Promise<RunPageAssemblyResult> {
  const paths = migrationPaths(args.targetDir);
  const approvedInventory = ApprovedInventorySchema.parse(
    JSON.parse(readFileSync(paths.approvedInventory, "utf8")),
  );
  const rawDiscovery = RawDiscoveryEvidenceSchema.parse(
    JSON.parse(readFileSync(paths.rawDiscovery, "utf8")),
  );
  const plan = planPageAssembly({
    approvedInventory,
    rawDiscovery,
    approvedComponentGroupIds: args.componentGroupIds,
  });
  const pagePlan = plan.pages.find(page => page.slug === args.slug);
  if (!pagePlan) {
    throw new Error(`Page ${args.slug} is not ready for assembly`);
  }

  const pagePath = writePageFile({
    targetDir: args.targetDir,
    slug: pagePlan.slug,
    sourceUrl: pagePlan.url,
    componentNames: pagePlan.components.map(component => component.implementationName),
  });

  const build = await (args.buildProject ?? runNextBuild)({ targetDir: args.targetDir });
  const references = pageReferences(rawDiscovery, args.slug);
  const pageReferenceVersion = hashArtifact(rawDiscovery.referenceScreenshots.pages);
  const results = build.exitCode === 0
    ? await verifyPageScreenshots({
      targetDir: args.targetDir,
      slug: args.slug,
      references,
      localBaseUrl: args.localBaseUrl ?? DEFAULT_LOCAL_BASE_URL,
      browserQueue: args.browserQueue ?? BrowserWorkQueue.from({ targetDir: args.targetDir }),
      screenshotCapturer: args.screenshotCapturer ?? capturePageScreenshot,
      readPng: args.readPng ?? readPng,
      diffPngs: args.diffPngs ?? diffNormalizedPngs,
      assessDiff: args.assessDiff ?? assessDiffResult,
      writePng: args.writePng ?? writePng,
    })
    : [];
  const failingViewports = results
    .filter(result => result.status !== "PASS")
    .map(result => result.viewport);
  const report = PageAssemblyReportSchema.parse({
    kind: "page-assembly-report",
    slug: args.slug,
    artifactVersion: approvedInventory.artifactVersion,
    pageReferenceVersion,
    generatedAt: (args.now ?? (() => new Date().toISOString()))(),
    componentGroupIds: pagePlan.components.map(component => component.componentGroupId),
    pagePath,
    build,
    verification: build.exitCode === 0 && failingViewports.length === 0 ? "PASS" : "FAIL",
    referencePaths: references.map(reference => absoluteMigrationPath(args.targetDir, reference.path)),
    screenshotPaths: results.map(result => result.screenshotPath),
    diffPaths: results
      .map(result => result.diffPath)
      .filter((path): path is string => Boolean(path)),
    failingViewports,
    error: build.exitCode === 0 ? null : build.stderr,
    results,
  });

  const reportPath = join(args.targetDir, ".migration/reports/page-assembly", `${args.slug}.json`);
  writeJson(reportPath, report);

  return { reportPath, report };
}

function writePageFile(args: {
  targetDir: string;
  slug: string;
  sourceUrl: string;
  componentNames: string[];
}): string {
  const routeDir = join(args.targetDir, "src/app", args.slug);
  mkdirSync(routeDir, { recursive: true });
  const pagePath = join(routeDir, "page.tsx");
  writeFileSync(pagePath, assemblePageTsx({
    group: {
      nextRoute: `/${args.slug}`,
      kind: "static",
      entries: [{ sourceUrl: args.sourceUrl, params: {} }],
    },
    sectionRefs: args.componentNames.map(componentName => ({ componentName })),
  }));
  return pagePath;
}

async function verifyPageScreenshots(args: {
  targetDir: string;
  slug: string;
  references: RawDiscoveryEvidence["referenceScreenshots"]["pages"];
  localBaseUrl: string;
  browserQueue: BrowserWorkQueueLike;
  screenshotCapturer: (args: PageScreenshotCapturerArgs) => Promise<void> | void;
  readPng: (path: string) => PNG;
  diffPngs: (reference: PNG, local: PNG) => DiffResult;
  assessDiff: typeof assessDiffResult;
  writePng: (path: string, png: PNG) => void;
}): Promise<PageAssemblyViewportResult[]> {
  const results: PageAssemblyViewportResult[] = [];
  const referenceByViewport = new Map(
    args.references.map(reference => [reference.viewport, reference]),
  );
  for (const viewport of REQUIRED_VIEWPORTS) {
    const reference = referenceByViewport.get(viewport);
    if (!reference) {
      results.push({
        viewport,
        status: "FAIL",
        ratio: 1,
        referencePath: "",
        screenshotPath: "",
        diagnostics: [`missing page reference for viewport ${viewport}`],
      });
      continue;
    }

    const referencePath = absoluteMigrationPath(args.targetDir, reference.path);
    const screenshotPath = join(args.targetDir, ".migration/reports/page-assembly", `${args.slug}-${viewport}.png`);
    await args.browserQueue.enqueue(() =>
      args.screenshotCapturer({
        pageUrl: `${args.localBaseUrl.replace(/\/$/, "")}/${args.slug}`,
        viewport,
        outputPath: screenshotPath,
      })
    );
    const referencePng = args.readPng(referencePath);
    const localPng = args.readPng(screenshotPath);
    const diff = args.diffPngs(referencePng, localPng);
    const assessment = args.assessDiff({
      ratio: diff.ratio,
      refLabel: `${args.slug}:${viewport}:source`,
      localLabel: `${args.slug}:${viewport}:migrated`,
      refSize: { width: referencePng.width, height: referencePng.height },
      localSize: { width: localPng.width, height: localPng.height },
      exactZeroIsSuspicious: false,
      maxDiffRatio: 0.02,
    });
    const diffPath = maybeWriteDiff({
      targetDir: args.targetDir,
      slug: args.slug,
      viewport,
      assessment,
      diff,
      writePng: args.writePng,
    });
    results.push({
      viewport,
      status: assessment.status,
      ratio: assessment.ratio,
      referencePath,
      screenshotPath,
      diffPath,
      diagnostics: assessment.diagnostics,
    });
  }
  return results;
}

function pageReferences(
  rawDiscovery: RawDiscoveryEvidence,
  slug: string,
): RawDiscoveryEvidence["referenceScreenshots"]["pages"] {
  const references = rawDiscovery.referenceScreenshots.pages.filter(reference => reference.slug === slug);
  if (references.length === 0) {
    throw new Error(`No page references found for ${slug}`);
  }
  return references;
}

async function capturePageScreenshot(args: PageScreenshotCapturerArgs): Promise<void> {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.setViewportSize({ width: args.viewport, height: 900 });
    await page.goto(args.pageUrl, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
    mkdirSync(dirname(args.outputPath), { recursive: true });
    await page.screenshot({
      path: args.outputPath,
      fullPage: true,
    });
  } finally {
    await browser.close();
  }
}

function maybeWriteDiff(args: {
  targetDir: string;
  slug: string;
  viewport: ComponentVerifyViewport;
  assessment: DiffAssessment;
  diff: DiffResult;
  writePng: (path: string, png: PNG) => void;
}): string | undefined {
  if (args.assessment.status === "PASS") return undefined;
  const diffPath = join(
    args.targetDir,
    ".migration/reports/page-assembly",
    `${args.slug}-${args.viewport}.diff.png`,
  );
  mkdirSync(dirname(diffPath), { recursive: true });
  args.writePng(diffPath, args.diff.diff);
  return diffPath;
}

function absoluteMigrationPath(targetDir: string, path: string): string {
  if (isAbsolute(path)) return path;
  if (path.startsWith(".migration/")) return join(targetDir, path);
  return join(targetDir, ".migration", path);
}

function readPng(path: string): PNG {
  return PNG.sync.read(readFileSync(path));
}

function writePng(path: string, png: PNG): void {
  writeFileSync(path, PNG.sync.write(png));
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
