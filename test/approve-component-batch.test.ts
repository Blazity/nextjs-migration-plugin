import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { approveComponentBatch } from "../lib/approve-component-batch.ts";
import { migrationPaths } from "../lib/migration-paths.ts";
import { ComponentBatchApprovalSchema } from "../schemas/approval.ts";
import { ApprovedBaselineSchema } from "../schemas/approved-baseline.ts";

const artifactVersion = "abcdefabcdef1234";
const approvedAt = "2026-05-07T12:30:00.000Z";

describe("approveComponentBatch", () => {
  it("records component approval and captures approved migrated baselines", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "approve-component-batch-"));
    const paths = migrationPaths(targetDir);
    const reportPath = join(targetDir, ".migration/reports/component-batches", `${artifactVersion}.json`);
    writeJson(paths.approvedInventory, approvedInventory());
    writeJson(reportPath, componentBatchReport());

    const captured: Array<{ storyUrl: string; viewport: number; outputPath: string }> = [];
    const result = await approveComponentBatch({
      targetDir,
      reportPath,
      approvedAt,
      userNotes: "Looks good",
      screenshotCapturer: async ({ storyUrl, viewport, outputPath }) => {
        captured.push({ storyUrl, viewport, outputPath });
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, `approved-${viewport}`);
      },
    });

    expect(result.ok).toBe(true);
    expect(captured).toEqual([
      {
        storyUrl: "http://127.0.0.1:6006/?path=/story/migrated-components-hero--hero",
        viewport: 390,
        outputPath: paths.approvedBaseline({ kind: "component", slugOrName: "Hero", viewport: 390 }),
      },
      {
        storyUrl: "http://127.0.0.1:6006/?path=/story/migrated-components-hero--hero",
        viewport: 768,
        outputPath: paths.approvedBaseline({ kind: "component", slugOrName: "Hero", viewport: 768 }),
      },
      {
        storyUrl: "http://127.0.0.1:6006/?path=/story/migrated-components-hero--hero",
        viewport: 1440,
        outputPath: paths.approvedBaseline({ kind: "component", slugOrName: "Hero", viewport: 1440 }),
      },
    ]);

    const approval = ComponentBatchApprovalSchema.parse(
      JSON.parse(readFileSync(paths.componentApproval("group-hero"), "utf8")),
    );
    expect(approval).toEqual({
      kind: "component-batch",
      approvedAt,
      artifactVersion,
      userNotes: "Looks good",
      componentGroupIds: ["group-hero"],
      implementationNames: ["Hero"],
    });

    const baseline = ApprovedBaselineSchema.parse(
      JSON.parse(readFileSync(paths.approvedBaselineManifest({
        kind: "component",
        slugOrName: "Hero",
      }), "utf8")),
    );
    expect(baseline).toEqual({
      approvalRef: `component-batch:${artifactVersion}:group-hero`,
      kind: "component",
      capturedAt: approvedAt,
      regressionThreshold: 0.001,
      screenshots: [390, 768, 1440].map(viewport => ({
        viewport,
        path: paths.approvedBaseline({ kind: "component", slugOrName: "Hero", viewport }),
        sha256: sha256(`approved-${viewport}`),
      })),
    });
  });

  it("rejects stale component batch reports when the approved inventory artifact changed", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "approve-component-batch-"));
    const paths = migrationPaths(targetDir);
    const reportPath = join(targetDir, ".migration/reports/component-batches", `${artifactVersion}.json`);
    const screenshotCapturer = vi.fn();
    writeJson(paths.approvedInventory, {
      ...approvedInventory(),
      artifactVersion: "1111111111111111",
    });
    writeJson(reportPath, componentBatchReport());

    const result = await approveComponentBatch({
      targetDir,
      reportPath,
      approvedAt,
      screenshotCapturer,
    });

    expect(result).toEqual({
      ok: false,
      reason: "stale-upstream",
    });
    expect(screenshotCapturer).not.toHaveBeenCalled();
    expect(existsSync(paths.componentApproval("group-hero"))).toBe(false);
  });

  it("does not persist component approval when baseline capture fails", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "approve-component-batch-"));
    const paths = migrationPaths(targetDir);
    const reportPath = join(targetDir, ".migration/reports/component-batches", `${artifactVersion}.json`);
    writeJson(paths.approvedInventory, approvedInventory());
    writeJson(reportPath, componentBatchReport());

    await expect(approveComponentBatch({
      targetDir,
      reportPath,
      approvedAt,
      screenshotCapturer: async () => {
        throw new Error("storybook unavailable");
      },
    })).rejects.toThrow("storybook unavailable");

    expect(existsSync(paths.componentApproval("group-hero"))).toBe(false);
    expect(existsSync(paths.approvedBaselineManifest({
      kind: "component",
      slugOrName: "Hero",
    }))).toBe(false);
  });
});

function approvedInventory() {
  return {
    approvedAt: "2026-05-07T12:00:00.000Z",
    artifactVersion,
    entries: [{
      componentGroupId: "group-hero",
      proposedName: "Hero",
      kind: "content",
      sectionInstanceIds: ["p0-s1"],
      implementationName: "Hero",
      filePath: "src/components/Hero.tsx",
    }],
  };
}

function componentBatchReport() {
  return {
    kind: "component-batch-report",
    artifactVersion,
    generatedAt: "2026-05-07T12:15:00.000Z",
    components: [{
      componentGroupId: "group-hero",
      implementationName: "Hero",
      kind: "content",
      componentPath: "/tmp/target/src/components/Hero.tsx",
      storyPath: "/tmp/target/src/components/Hero.stories.tsx",
      verification: "PASS",
      storybookUrls: ["http://127.0.0.1:6006/?path=/story/migrated-components-hero--hero"],
      referencePaths: [],
      diffPaths: [],
      failingViewports: [],
      error: null,
    }],
  };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
