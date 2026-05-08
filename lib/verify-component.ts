import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import {
  assessDiffResult,
  diffNormalizedPngs,
  type DiffAssessment,
  type DiffResult,
} from "../scripts/lib/visual-verify-core.ts";
import { BrowserWorkQueue, type BrowserWorkQueueLike } from "./browser-work-queue.ts";

export type ComponentVerifyViewport = 390 | 768 | 1440;
const REQUIRED_VIEWPORTS = [390, 768, 1440] as const satisfies readonly ComponentVerifyViewport[];

export interface ComponentReference {
  viewport: ComponentVerifyViewport;
  referencePath: string;
  storyUrl: string;
}

export interface VerifyComponentInput {
  name: string;
  references: ComponentReference[];
  diffOutputDir?: string;
  maxDiffRatio?: number;
}

export interface VerifyComponentPage {
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  goto(url: string, options?: { waitUntil?: "domcontentloaded" | "networkidle"; timeout?: number }): Promise<void>;
  screenshot(options?: { path?: string; fullPage?: boolean }): Promise<Buffer>;
  close(): Promise<void>;
}

export interface VerifyComponentDeps {
  pageFactory?: () => Promise<VerifyComponentPage>;
  browserQueue?: BrowserWorkQueueLike;
  readPng?: (path: string) => PNG;
  decodePng?: (buffer: Buffer) => PNG;
  writePng?: (path: string, png: PNG) => void;
  diffPngs?: (reference: PNG, local: PNG) => DiffResult;
  assessDiff?: typeof assessDiffResult;
}

export interface VerifyComponentViewportResult {
  viewport: ComponentVerifyViewport;
  status: DiffAssessment["status"];
  ratio: number;
  referencePath: string;
  storyUrl: string;
  diffPath?: string;
  diagnostics: string[];
}

export interface VerifyComponentResult {
  status: "PASS" | "FAIL";
  ratios: Partial<Record<ComponentVerifyViewport, number>>;
  failingViewports: ComponentVerifyViewport[];
  results: VerifyComponentViewportResult[];
}

export async function verifyComponent(
  input: VerifyComponentInput,
  deps: VerifyComponentDeps = {},
): Promise<VerifyComponentResult> {
  const results: VerifyComponentViewportResult[] = [];
  const ratios: Partial<Record<ComponentVerifyViewport, number>> = {};
  const failingViewports: ComponentVerifyViewport[] = [];
  const seenViewports = new Set<ComponentVerifyViewport>();
  const browserQueue = deps.browserQueue ?? new BrowserWorkQueue();
  const pageFactory = deps.pageFactory ?? defaultPageFactory;

  for (const reference of input.references) {
    seenViewports.add(reference.viewport);
    await browserQueue.enqueue(async () => {
      const page = await pageFactory();
      try {
        await page.setViewportSize({ width: reference.viewport, height: 900 });
        await page.goto(reference.storyUrl, {
          waitUntil: "domcontentloaded",
          timeout: 15_000,
        });
        const screenshot = await page.screenshot({ fullPage: true });
        const referencePng = (deps.readPng ?? readPng)(reference.referencePath);
        const localPng = (deps.decodePng ?? decodePng)(screenshot);
        const diff = (deps.diffPngs ?? diffNormalizedPngs)(referencePng, localPng);
        const assessment = (deps.assessDiff ?? assessDiffResult)({
          ratio: diff.ratio,
          refLabel: `${input.name}:${reference.viewport}:reference`,
          localLabel: `${input.name}:${reference.viewport}:storybook`,
          refSize: { width: referencePng.width, height: referencePng.height },
          localSize: { width: localPng.width, height: localPng.height },
          exactZeroIsSuspicious: false,
          maxDiffRatio: input.maxDiffRatio ?? 0.01,
        });
        const diffPath = maybeWriteDiff({
          input,
          viewport: reference.viewport,
          diff,
          writePng: deps.writePng ?? writePng,
        });

        ratios[reference.viewport] = assessment.ratio;
        if (assessment.status === "FAIL") {
          pushUnique(failingViewports, reference.viewport);
        }
        results.push({
          viewport: reference.viewport,
          status: assessment.status,
          ratio: assessment.ratio,
          referencePath: reference.referencePath,
          storyUrl: reference.storyUrl,
          diffPath,
          diagnostics: assessment.diagnostics,
        });
      } finally {
        await page.close();
      }
    });
  }

  for (const viewport of REQUIRED_VIEWPORTS) {
    if (seenViewports.has(viewport)) continue;
    pushUnique(failingViewports, viewport);
    results.push({
      viewport,
      status: "FAIL",
      ratio: 1,
      referencePath: "",
      storyUrl: "",
      diagnostics: [`missing reference for viewport ${viewport}`],
    });
  }

  return {
    status: failingViewports.length === 0 ? "PASS" : "FAIL",
    ratios,
    failingViewports,
    results,
  };
}

async function defaultPageFactory(): Promise<VerifyComponentPage> {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  return {
    async setViewportSize(size) {
      await page.setViewportSize(size);
    },
    async goto(url, options) {
      await page.goto(url, options);
    },
    async screenshot(options) {
      return page.screenshot(options);
    },
    async close() {
      await page.close();
      await browser.close();
    },
  };
}

function pushUnique<T>(values: T[], value: T): void {
  if (!values.includes(value)) values.push(value);
}

function maybeWriteDiff(args: {
  input: VerifyComponentInput;
  viewport: ComponentVerifyViewport;
  diff: DiffResult;
  writePng: (path: string, png: PNG) => void;
}): string | undefined {
  if (!args.input.diffOutputDir) return undefined;
  mkdirSync(args.input.diffOutputDir, { recursive: true });
  const diffPath = join(args.input.diffOutputDir, `${args.input.name}-${args.viewport}.diff.png`);
  args.writePng(diffPath, args.diff.diff);
  return diffPath;
}

function readPng(path: string): PNG {
  return PNG.sync.read(readFileSync(path));
}

function decodePng(buffer: Buffer): PNG {
  return PNG.sync.read(buffer);
}

function writePng(path: string, png: PNG): void {
  writeFileSync(path, PNG.sync.write(png));
}
