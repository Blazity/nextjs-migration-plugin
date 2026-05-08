import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { checkComponentRegression } from "../lib/check-component-regression.ts";
import { migrationPaths } from "../lib/migration-paths.ts";
import type { VerifyComponentInput } from "../lib/verify-component.ts";

const capturedAt = "2026-05-07T12:30:00.000Z";

describe("checkComponentRegression", () => {
  it("checks the current Storybook render against approved baselines at 0.1%", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "component-regression-"));
    const paths = migrationPaths(targetDir);
    const baselinePath = paths.approvedBaselineManifest({
      kind: "component",
      slugOrName: "Hero",
    });
    writeJson(baselinePath, approvedBaseline(paths));
    let verifyInput: VerifyComponentInput | undefined;

    const result = await checkComponentRegression({
      baselinePath,
      implementationName: "Hero",
      storybookBaseUrl: "http://127.0.0.1:6006",
      diffOutputDir: join(targetDir, ".migration/reports/regressions/Hero-diffs"),
      verifyComponent: vi.fn(async input => {
        verifyInput = input;
        return {
          status: "FAIL" as const,
          ratios: { 390: 0, 768: 0.002, 1440: 0 },
          failingViewports: [768 as const],
          results: [{
            viewport: 768 as const,
            status: "FAIL" as const,
            ratio: 0.002,
            similarity: 0.998,
            pixelDiffRatio: 0.002,
            bestOffset: { x: 0, y: 0 },
            referencePath: paths.approvedBaseline({ kind: "component", slugOrName: "Hero", viewport: 768 }),
            storyUrl: "http://127.0.0.1:6006/iframe.html?id=migrated-components-hero--hero&viewMode=story",
            diffPath: join(targetDir, ".migration/reports/regressions/Hero-diffs/Hero-768.diff.png"),
            diagnostics: ["0.2% exceeds 0.1%"],
          }],
        };
      }),
    });

    expect(verifyInput).toEqual({
      name: "Hero",
      maxDiffRatio: 0.001,
      references: [390, 768, 1440].map(viewport => ({
        viewport,
        referencePath: paths.approvedBaseline({ kind: "component", slugOrName: "Hero", viewport }),
        storyUrl: "http://127.0.0.1:6006/iframe.html?id=migrated-components-hero--hero&viewMode=story",
      })),
      diffOutputDir: join(targetDir, ".migration/reports/regressions/Hero-diffs"),
    });
    expect(result).toEqual({
      status: "FAIL",
      failingViewports: [768],
      diffPaths: [join(targetDir, ".migration/reports/regressions/Hero-diffs/Hero-768.diff.png")],
      results: [{
        viewport: 768,
        status: "FAIL",
        ratio: 0.002,
        similarity: 0.998,
        pixelDiffRatio: 0.002,
        bestOffset: { x: 0, y: 0 },
        referencePath: paths.approvedBaseline({ kind: "component", slugOrName: "Hero", viewport: 768 }),
        storyUrl: "http://127.0.0.1:6006/iframe.html?id=migrated-components-hero--hero&viewMode=story",
        diffPath: join(targetDir, ".migration/reports/regressions/Hero-diffs/Hero-768.diff.png"),
        diagnostics: ["0.2% exceeds 0.1%"],
      }],
    });
    expect(JSON.parse(readFileSync(baselinePath, "utf8"))).toEqual(approvedBaseline(paths));
  });
});

function approvedBaseline(paths: ReturnType<typeof migrationPaths>) {
  return {
    approvalRef: "component-batch:abcdefabcdef1234:group-hero",
    kind: "component",
    capturedAt,
    regressionThreshold: 0.001,
    screenshots: [390, 768, 1440].map(viewport => ({
      viewport,
      path: paths.approvedBaseline({ kind: "component", slugOrName: "Hero", viewport }),
      sha256: `${viewport}`.padStart(64, "a"),
    })),
  };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
