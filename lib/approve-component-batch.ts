import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ComponentBatchApprovalSchema, type ComponentBatchApproval } from "../schemas/approval.ts";
import { ApprovedBaselineSchema, type ApprovedBaseline } from "../schemas/approved-baseline.ts";
import { ApprovedInventorySchema, type ApprovedInventory } from "../schemas/approved-inventory.ts";
import { ComponentBatchReportSchema, type ComponentBatchReport, type ComponentBatchReportEntry } from "../schemas/component-batch-report.ts";
import { BrowserWorkQueue, type BrowserWorkQueueLike } from "./browser-work-queue.ts";
import { recordMigrationDecision } from "./migration-decision-journal.ts";
import { migrationPaths } from "./migration-paths.ts";
import { componentStorybookUrl } from "./storybook-url.ts";
import type { ComponentVerifyViewport } from "./verify-component.ts";

const BASELINE_VIEWPORTS = [390, 768, 1440] as const satisfies readonly ComponentVerifyViewport[];
const DEFAULT_STORYBOOK_BASE_URL = "http://127.0.0.1:6006";

export type BaselineScreenshotCapturerArgs = Readonly<{
  storyUrl: string;
  viewport: ComponentVerifyViewport;
  outputPath: string;
}>;

export type ApproveComponentBatchArgs = Readonly<{
  targetDir: string;
  reportPath?: string;
  report?: ComponentBatchReport;
  approvedAt?: string;
  userNotes?: string;
  storybookBaseUrl?: string;
  browserQueue?: BrowserWorkQueueLike;
  screenshotCapturer?: (
    args: BaselineScreenshotCapturerArgs
  ) => Promise<void> | void;
}>;

export type ApproveComponentBatchResult =
  | Readonly<{
      ok: true;
      approval: ComponentBatchApproval;
      approvalPaths: string[];
      baselines: Array<{
        componentGroupId: string;
        path: string;
        baseline: ApprovedBaseline;
      }>;
    }>
  | Readonly<{
      ok: false;
      reason: "stale-upstream";
    }>;

export async function approveComponentBatch(
  args: ApproveComponentBatchArgs,
): Promise<ApproveComponentBatchResult> {
  const paths = migrationPaths(args.targetDir);
  const report = loadReport(args);
  const approvedInventory = ApprovedInventorySchema.parse(
    JSON.parse(readFileSync(paths.approvedInventory, "utf8")),
  );

  if (!approvedInventoryMatchesReport(approvedInventory, report)) {
    return {
      ok: false,
      reason: "stale-upstream",
    };
  }

  const approvedAt = args.approvedAt ?? new Date().toISOString();
  const browserQueue = args.browserQueue ?? BrowserWorkQueue.from({ targetDir: args.targetDir });
  const screenshotCapturer = args.screenshotCapturer ?? captureStorybookScreenshot;
  const approval = ComponentBatchApprovalSchema.parse({
    kind: "component-batch",
    approvedAt,
    artifactVersion: report.artifactVersion,
    userNotes: args.userNotes,
    componentGroupIds: report.components.map(component => component.componentGroupId),
    implementationNames: report.components.map(component => component.implementationName),
  });

  const baselines = [];
  for (const component of report.components) {
    const baselinePath = paths.approvedBaselineManifest({
      kind: "component",
      slugOrName: component.implementationName,
    });
    const baseline = ApprovedBaselineSchema.parse({
      approvalRef: `component-batch:${report.artifactVersion}:${component.componentGroupId}`,
      kind: "component",
      capturedAt: approvedAt,
      regressionThreshold: 0.001,
      screenshots: await captureBaselineScreenshots({
        paths,
        component,
        storybookBaseUrl: args.storybookBaseUrl ?? DEFAULT_STORYBOOK_BASE_URL,
        browserQueue,
        screenshotCapturer,
      }),
    });
    writeJson(baselinePath, baseline);
    baselines.push({
      componentGroupId: component.componentGroupId,
      path: baselinePath,
      baseline,
    });
  }
  const approvalPaths = report.components.map(component =>
    paths.componentApproval(component.componentGroupId)
  );
  for (const approvalPath of approvalPaths) {
    writeJson(approvalPath, approval);
  }
  recordMigrationDecision({
    targetDir: args.targetDir,
    kind: "component-batch-approval",
    actor: "user",
    createdAt: approvedAt,
    summary: "Approved Component Batch",
    artifactVersion: report.artifactVersion,
    userNotes: args.userNotes,
    details: {
      componentGroupIds: approval.componentGroupIds,
      implementationNames: approval.implementationNames,
      reportPath: args.reportPath,
    },
  });

  return {
    ok: true,
    approval,
    approvalPaths,
    baselines,
  };
}

async function captureBaselineScreenshots(args: {
  paths: ReturnType<typeof migrationPaths>;
  component: ComponentBatchReportEntry;
  storybookBaseUrl: string;
  browserQueue: BrowserWorkQueueLike;
  screenshotCapturer: (args: BaselineScreenshotCapturerArgs) => Promise<void> | void;
}): Promise<ApprovedBaseline["screenshots"]> {
  const storyUrl = args.component.storybookUrls[0] ??
    componentStorybookUrl(args.storybookBaseUrl, args.component.implementationName);
  const screenshots = [];
  for (const viewport of BASELINE_VIEWPORTS) {
    const outputPath = args.paths.approvedBaseline({
      kind: "component",
      slugOrName: args.component.implementationName,
      viewport,
    });
    await args.browserQueue.enqueue(() =>
      args.screenshotCapturer({
        storyUrl,
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

function approvedInventoryMatchesReport(
  approvedInventory: ApprovedInventory,
  report: ComponentBatchReport,
): boolean {
  if (approvedInventory.staleSince || approvedInventory.artifactVersion !== report.artifactVersion) {
    return false;
  }

  const approvedEntries = new Map(
    approvedInventory.entries.map(entry => [entry.componentGroupId, entry]),
  );
  return report.components.every(component => {
    const approvedEntry = approvedEntries.get(component.componentGroupId);
    return approvedEntry?.implementationName === component.implementationName;
  });
}

function loadReport(args: ApproveComponentBatchArgs): ComponentBatchReport {
  if (args.report) return ComponentBatchReportSchema.parse(args.report);
  if (args.reportPath) {
    return ComponentBatchReportSchema.parse(JSON.parse(readFileSync(args.reportPath, "utf8")));
  }
  throw new Error("approveComponentBatch requires report or reportPath");
}

async function captureStorybookScreenshot(args: BaselineScreenshotCapturerArgs): Promise<void> {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.setViewportSize({ width: args.viewport, height: 900 });
    await page.goto(args.storyUrl, {
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

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
