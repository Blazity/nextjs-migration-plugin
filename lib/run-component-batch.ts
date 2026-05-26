import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { BrowserWorkQueue, type BrowserWorkQueueLike } from "./browser-work-queue.ts";
import { implementComponent as defaultImplementComponent, type ImplementComponentResult } from "./implement-component.ts";
import { migrationPaths } from "./migration-paths.ts";
import { withStorybookServer as defaultWithStorybookServer } from "./storybook-server.ts";
import { componentStorybookReviewUrl, componentStorybookUrl } from "./storybook-url.ts";
import { verifyComponent as defaultVerifyComponent, type ComponentReference, type VerifyComponentInput, type VerifyComponentResult } from "./verify-component.ts";
import { classifyInteractionBehavior } from "./interaction-behavior.ts";
import { ApprovedInventoryEntrySchema, type ApprovedInventoryEntry } from "../schemas/approved-inventory.ts";
import type { ComponentBatchReport, ComponentBatchReportEntry } from "../schemas/component-batch-report.ts";
import { RawDiscoveryEvidenceSchema, type RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";

export interface RunComponentBatchResult {
  reportPath: string;
  report: ComponentBatchReport;
}

export interface RunComponentBatchArgs {
  targetDir: string;
  artifactVersion: string;
  batch: ApprovedInventoryEntry[];
  storybookBaseUrl?: string;
  now?: () => string;
  implementComponent?: (args: {
    targetDir: string;
    entry: ApprovedInventoryEntry;
  }) => Promise<ImplementComponentResult> | ImplementComponentResult;
  verifyComponent?: (input: VerifyComponentInput) => Promise<VerifyComponentResult>;
  browserQueue?: BrowserWorkQueueLike;
  withStorybookServer?: <T>(args: {
    targetDir: string;
    baseUrl?: string;
    run: (context: { baseUrl: string }) => Promise<T> | T;
  }) => Promise<T>;
}

export async function runComponentBatch(
  args: RunComponentBatchArgs,
): Promise<RunComponentBatchResult> {
  if (!args.storybookBaseUrl && args.batch.some(entry => ApprovedInventoryEntrySchema.parse(entry).kind === "content")) {
    return (args.withStorybookServer ?? defaultWithStorybookServer)({
      targetDir: args.targetDir,
      baseUrl: args.storybookBaseUrl,
      run: ({ baseUrl }) => runComponentBatch({
        ...args,
        storybookBaseUrl: baseUrl,
      }),
    });
  }

  const paths = migrationPaths(args.targetDir);
  const evidence = RawDiscoveryEvidenceSchema.parse(
    JSON.parse(readFileSync(paths.rawDiscovery, "utf8")),
  );
  const implement = args.implementComponent ?? defaultImplementComponent;
  const browserQueue = args.browserQueue ?? BrowserWorkQueue.from({ targetDir: args.targetDir });
  const injectedVerify = args.verifyComponent;
  const verify = injectedVerify
    ? (input: VerifyComponentInput) => browserQueue.enqueue(() => injectedVerify(input))
    : (input: VerifyComponentInput) => defaultVerifyComponent(input, { browserQueue });
  const components: ComponentBatchReportEntry[] = [];
  const diffOutputDir = join(
    args.targetDir,
    ".migration/reports/component-batches",
    `${args.artifactVersion}-diffs`,
  );

  for (const rawEntry of args.batch) {
    const entry = ApprovedInventoryEntrySchema.parse(rawEntry);
    let implementation: ImplementComponentResult;
    try {
      implementation = await implement({
        targetDir: args.targetDir,
        entry,
      });
    } catch (error) {
      components.push(failedImplementationEntry({
        targetDir: args.targetDir,
        entry,
        error,
      }));
      continue;
    }

    // Shells and `emit: "skip"` plumbing groups skip pixel-diff entirely.
    // emit:skip entries have no `.stories.tsx`, so the downstream baseline
    // capture would 404 on the Storybook URL. See docs/issues/004.
    if (entry.kind === "shell" || entry.emit === "skip") {
      components.push({
        componentGroupId: entry.componentGroupId,
        implementationName: entry.implementationName,
        kind: entry.kind,
        componentPath: implementation.componentPath,
        storyPath: implementation.storyPath,
        verification: "skipped-by-design",
        storybookUrls: [],
        referencePaths: [],
        diffPaths: [],
        failingViewports: [],
        error: null,
      });
      continue;
    }

    const references = componentReferences({
      targetDir: args.targetDir,
      evidence,
      entry,
      storybookBaseUrl: args.storybookBaseUrl ?? "http://127.0.0.1:6006",
    });
    const verification = await verifyComponentSafely({
      verify,
      input: {
        name: entry.implementationName,
        references,
        diffOutputDir,
      },
    });

    components.push({
      componentGroupId: entry.componentGroupId,
      implementationName: entry.implementationName,
      kind: entry.kind,
      componentPath: implementation.componentPath,
      storyPath: implementation.storyPath,
      verification: verification.status,
      storybookUrls: storybookReviewUrls({
        entry,
        storybookBaseUrl: args.storybookBaseUrl ?? "http://127.0.0.1:6006",
      }),
      referencePaths: references.map(reference => reference.referencePath),
      diffPaths: verification.results
        .map(result => result.diffPath)
        .filter((path): path is string => Boolean(path)),
      failingViewports: verification.failingViewports,
      error: verification.error,
      interaction: classifyInteractionBehavior({
        entry,
        evidence,
      }),
    });
  }

  const report: ComponentBatchReport = {
    kind: "component-batch-report",
    artifactVersion: args.artifactVersion,
    generatedAt: (args.now ?? (() => new Date().toISOString()))(),
    components,
  };
  const reportPath = join(
    args.targetDir,
    ".migration/reports/component-batches",
    `${args.artifactVersion}.json`,
  );
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  return { reportPath, report };
}

function storybookReviewUrls(args: {
  entry: ApprovedInventoryEntry;
  storybookBaseUrl: string;
}): string[] {
  return unique(args.entry.sectionInstanceIds.map((_, index) => {
    const storyName = index === 0
      ? args.entry.implementationName
      : `${args.entry.implementationName}Variant${index + 1}`;
    return componentStorybookReviewUrl(args.storybookBaseUrl, args.entry.implementationName, storyName);
  }));
}

function failedImplementationEntry(args: {
  targetDir: string;
  entry: ApprovedInventoryEntry;
  error: unknown;
}): ComponentBatchReportEntry {
  const componentPath = join(args.targetDir, args.entry.filePath);
  return {
    componentGroupId: args.entry.componentGroupId,
    implementationName: args.entry.implementationName,
    kind: args.entry.kind,
    componentPath,
    storyPath: join(dirname(componentPath), `${args.entry.implementationName}.stories.tsx`),
    verification: "FAIL",
    storybookUrls: [],
    referencePaths: [],
    diffPaths: [],
    failingViewports: [390, 768, 1440],
    error: args.error instanceof Error ? args.error.message : String(args.error),
  };
}

async function verifyComponentSafely(args: {
  verify: (input: VerifyComponentInput) => Promise<VerifyComponentResult>;
  input: VerifyComponentInput;
}): Promise<VerifyComponentResult & { error: string | null }> {
  try {
    const result = await args.verify(args.input);
    return { ...result, error: null };
  } catch (error) {
    return {
      status: "FAIL",
      ratios: {},
      failingViewports: [390, 768, 1440],
      results: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function componentReferences(args: {
  targetDir: string;
  evidence: RawDiscoveryEvidence;
  entry: ApprovedInventoryEntry;
  storybookBaseUrl: string;
}): ComponentReference[] {
  const sectionOrder = new Map(
    args.entry.sectionInstanceIds.map((sectionInstanceId, index) => [sectionInstanceId, index]),
  );
  return args.evidence.referenceScreenshots.components
    .filter(reference => sectionOrder.has(reference.sectionInstanceId))
    .sort((a, b) =>
      (sectionOrder.get(a.sectionInstanceId) ?? 0) -
        (sectionOrder.get(b.sectionInstanceId) ?? 0) ||
      a.viewport - b.viewport
    )
    .map(reference => {
      const variantIndex = sectionOrder.get(reference.sectionInstanceId) ?? 0;
      const storyName = variantIndex === 0
        ? args.entry.implementationName
        : `${args.entry.implementationName}Variant${variantIndex + 1}`;
      return {
        viewport: reference.viewport,
        referencePath: absoluteReferencePath(args.targetDir, reference.path),
        storyUrl: componentStorybookUrl(args.storybookBaseUrl, args.entry.implementationName, storyName),
      };
    });
}

function absoluteReferencePath(targetDir: string, path: string): string {
  if (isAbsolute(path)) return path;
  if (path.startsWith(".migration/")) return join(targetDir, path);
  return join(targetDir, ".migration", path);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
