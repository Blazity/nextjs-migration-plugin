import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import {
  assessDiffResult,
  diffNormalizedPngs,
  type DiffAssessment,
  type DiffResult,
} from "../scripts/lib/visual-verify-core.ts";

export type ComponentVerifyViewport = 390 | 768 | 1440;

export interface ComponentReference {
  viewport: ComponentVerifyViewport;
  referencePath: string;
  storyUrl: string;
}

export interface VerifyComponentInput {
  name: string;
  references: ComponentReference[];
  diffOutputDir?: string;
}

export interface VerifyComponentPage {
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  goto(url: string, options?: { waitUntil?: "domcontentloaded" | "networkidle"; timeout?: number }): Promise<void>;
  screenshot(options?: { path?: string; fullPage?: boolean }): Promise<Buffer>;
  close(): Promise<void>;
}

export interface VerifyComponentDeps {
  pageFactory: () => Promise<VerifyComponentPage>;
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
  deps: VerifyComponentDeps,
): Promise<VerifyComponentResult> {
  const results: VerifyComponentViewportResult[] = [];
  const ratios: Partial<Record<ComponentVerifyViewport, number>> = {};
  const failingViewports: ComponentVerifyViewport[] = [];

  for (const reference of input.references) {
    const page = await deps.pageFactory();
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
        maxDiffRatio: 0.01,
      });
      const diffPath = maybeWriteDiff({
        input,
        viewport: reference.viewport,
        diff,
        writePng: deps.writePng ?? writePng,
      });

      ratios[reference.viewport] = assessment.ratio;
      if (assessment.status === "FAIL") {
        failingViewports.push(reference.viewport);
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
  }

  return {
    status: failingViewports.length === 0 ? "PASS" : "FAIL",
    ratios,
    failingViewports,
    results,
  };
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
