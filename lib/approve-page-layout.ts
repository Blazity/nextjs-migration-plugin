import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ComponentBatchApprovalSchema, PageLayoutApprovalSchema, type PageLayoutApproval } from "../schemas/approval.ts";
import { ApprovedBaselineSchema, type ApprovedBaseline } from "../schemas/approved-baseline.ts";
import { ApprovedInventorySchema, type ApprovedInventory } from "../schemas/approved-inventory.ts";
import { PageAssemblyReportSchema, type PageAssemblyReport } from "../schemas/page-assembly-report.ts";
import { BrowserWorkQueue, type BrowserWorkQueueLike } from "./browser-work-queue.ts";
import { migrationPaths } from "./migration-paths.ts";
import { capturePageScreenshot, localPageUrlForSlug, type PageScreenshotCapturerArgs } from "./run-page-assembly.ts";
import type { ComponentVerifyViewport } from "./verify-component.ts";

const BASELINE_VIEWPORTS = [390, 768, 1440] as const satisfies readonly ComponentVerifyViewport[];
const DEFAULT_LOCAL_BASE_URL = "http://127.0.0.1:3000";

export type ApprovePageLayoutArgs = Readonly<{
  targetDir: string;
  reportPath?: string;
  report?: PageAssemblyReport;
  approvedAt?: string;
  userNotes?: string;
  localBaseUrl?: string;
  browserQueue?: BrowserWorkQueueLike;
  screenshotCapturer?: (args: PageScreenshotCapturerArgs) => Promise<void> | void;
}>;

export type ApprovePageLayoutResult =
  | Readonly<{
      ok: true;
      approval: PageLayoutApproval;
      approvalPath: string;
      baselinePath: string;
      baseline: ApprovedBaseline;
    }>
  | Readonly<{
      ok: false;
      reason: "stale-components";
      componentGroupIds: string[];
    }>;

export async function approvePageLayout(
  args: ApprovePageLayoutArgs,
): Promise<ApprovePageLayoutResult> {
  const paths = migrationPaths(args.targetDir);
  const report = loadReport(args);
  const approvedInventory = ApprovedInventorySchema.parse(
    JSON.parse(readFileSync(paths.approvedInventory, "utf8")),
  );
  const staleComponents = staleComponentApprovals({
    targetDir: args.targetDir,
    report,
    approvedInventory,
  });
  if (staleComponents.length > 0) {
    return {
      ok: false,
      reason: "stale-components",
      componentGroupIds: staleComponents,
    };
  }

  const approvedAt = args.approvedAt ?? new Date().toISOString();
  const approval = PageLayoutApprovalSchema.parse({
    kind: "page-layout",
    approvedAt,
    artifactVersion: report.artifactVersion,
    userNotes: args.userNotes,
    slug: report.slug,
    componentGroupIds: report.componentGroupIds,
    pageReferenceVersion: report.pageReferenceVersion,
  });
  const approvalPath = paths.pageApproval(report.slug);

  const browserQueue = args.browserQueue ?? BrowserWorkQueue.from({ targetDir: args.targetDir });
  const screenshotCapturer = args.screenshotCapturer ?? capturePageScreenshot;
  const baseline = ApprovedBaselineSchema.parse({
    approvalRef: `page-layout:${report.artifactVersion}:${report.slug}`,
    kind: "page",
    capturedAt: approvedAt,
    regressionThreshold: 0.001,
    screenshots: await captureBaselineScreenshots({
      paths,
      slug: report.slug,
      localBaseUrl: args.localBaseUrl ?? DEFAULT_LOCAL_BASE_URL,
      browserQueue,
      screenshotCapturer,
    }),
  });
  const baselinePath = paths.approvedBaselineManifest({
    kind: "page",
    slugOrName: report.slug,
  });
  writeJson(baselinePath, baseline);
  writeJson(approvalPath, approval);

  return {
    ok: true,
    approval,
    approvalPath,
    baselinePath,
    baseline,
  };
}

async function captureBaselineScreenshots(args: {
  paths: ReturnType<typeof migrationPaths>;
  slug: string;
  localBaseUrl: string;
  browserQueue: BrowserWorkQueueLike;
  screenshotCapturer: (args: PageScreenshotCapturerArgs) => Promise<void> | void;
}): Promise<ApprovedBaseline["screenshots"]> {
  const screenshots = [];
  for (const viewport of BASELINE_VIEWPORTS) {
    const outputPath = args.paths.approvedBaseline({
      kind: "page",
      slugOrName: args.slug,
      viewport,
    });
    await args.browserQueue.enqueue(() =>
      args.screenshotCapturer({
        pageUrl: localPageUrlForSlug(args.localBaseUrl, args.slug),
        viewport,
        outputPath,
      })
    );
    screenshots.push({
      viewport,
      path: outputPath,
      sha256: sha256File(outputPath),
    });
  }
  return screenshots;
}

function staleComponentApprovals(args: {
  targetDir: string;
  report: PageAssemblyReport;
  approvedInventory: ApprovedInventory;
}): string[] {
  if (args.approvedInventory.staleSince || args.approvedInventory.artifactVersion !== args.report.artifactVersion) {
    return args.report.componentGroupIds;
  }
  const approvedEntries = new Map(
    args.approvedInventory.entries.map(entry => [entry.componentGroupId, entry]),
  );
  const stale = [];
  for (const componentGroupId of args.report.componentGroupIds) {
    const approvedEntry = approvedEntries.get(componentGroupId);
    const approvalPath = migrationPaths(args.targetDir).componentApproval(componentGroupId);
    if (!approvedEntry || !existsSync(approvalPath)) {
      stale.push(componentGroupId);
      continue;
    }

    const approval = ComponentBatchApprovalSchema.parse(JSON.parse(readFileSync(approvalPath, "utf8")));
    const componentIndex = approval.componentGroupIds.indexOf(componentGroupId);
    if (
      approval.staleSince ||
      approval.artifactVersion !== args.approvedInventory.artifactVersion ||
      componentIndex < 0 ||
      approval.implementationNames[componentIndex] !== approvedEntry.implementationName
    ) {
      stale.push(componentGroupId);
    }
  }
  return stale;
}

function loadReport(args: ApprovePageLayoutArgs): PageAssemblyReport {
  if (args.report) return PageAssemblyReportSchema.parse(args.report);
  if (args.reportPath) {
    return PageAssemblyReportSchema.parse(JSON.parse(readFileSync(args.reportPath, "utf8")));
  }
  throw new Error("approvePageLayout requires report or reportPath");
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
