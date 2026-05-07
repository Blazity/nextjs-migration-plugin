import { readFileSync } from "node:fs";
import { ApprovedBaselineSchema } from "../schemas/approved-baseline.ts";
import { componentStorybookUrl } from "./storybook-url.ts";
import { verifyComponent as defaultVerifyComponent, type ComponentVerifyViewport, type VerifyComponentInput, type VerifyComponentResult, type VerifyComponentViewportResult } from "./verify-component.ts";

const DEFAULT_STORYBOOK_BASE_URL = "http://127.0.0.1:6006";

export type CheckComponentRegressionArgs = Readonly<{
  baselinePath: string;
  implementationName: string;
  storybookBaseUrl?: string;
  diffOutputDir?: string;
  verifyComponent?: (input: VerifyComponentInput) => Promise<VerifyComponentResult>;
}>;

export type CheckComponentRegressionResult = Readonly<{
  status: "PASS" | "FAIL";
  failingViewports: ComponentVerifyViewport[];
  diffPaths: string[];
  results: VerifyComponentViewportResult[];
}>;

export async function checkComponentRegression(
  args: CheckComponentRegressionArgs,
): Promise<CheckComponentRegressionResult> {
  const baseline = ApprovedBaselineSchema.parse(JSON.parse(readFileSync(args.baselinePath, "utf8")));
  const storyUrl = componentStorybookUrl(
    args.storybookBaseUrl ?? DEFAULT_STORYBOOK_BASE_URL,
    args.implementationName,
  );
  const verify = args.verifyComponent ?? defaultVerifyComponent;
  const result = await verify({
    name: args.implementationName,
    maxDiffRatio: baseline.regressionThreshold,
    references: baseline.screenshots.map(screenshot => ({
      viewport: screenshot.viewport,
      referencePath: screenshot.path,
      storyUrl,
    })),
    diffOutputDir: args.diffOutputDir,
  });

  return {
    status: result.status,
    failingViewports: result.failingViewports,
    diffPaths: result.results
      .map(viewport => viewport.diffPath)
      .filter((path): path is string => Boolean(path)),
    results: result.results,
  };
}
