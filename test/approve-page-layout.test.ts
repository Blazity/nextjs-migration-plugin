import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { approvePageLayout } from "../lib/approve-page-layout.ts";
import { migrationPaths } from "../lib/migration-paths.ts";
import { ComponentBatchApprovalSchema, PageLayoutApprovalSchema } from "../schemas/approval.ts";
import { ApprovedBaselineSchema } from "../schemas/approved-baseline.ts";
import type { ApprovedInventory } from "../schemas/approved-inventory.ts";

const artifactVersion = "abcdefabcdef1234";
const pageReferenceVersion = "1234567890abcdef";
const approvedAt = "2026-05-07T12:30:00.000Z";

describe("approvePageLayout", () => {
  it("records page approval and captures approved page baselines", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "approve-page-layout-"));
    const paths = migrationPaths(targetDir);
    const reportPath = join(targetDir, ".migration/reports/page-assembly/home.json");
    writeJson(paths.approvedInventory, approvedInventory());
    writeComponentApproval(targetDir, "group-header", "SiteHeader");
    writeComponentApproval(targetDir, "group-hero", "Hero");
    writeJson(reportPath, pageReport(targetDir));

    const captured: Array<{ pageUrl: string; viewport: number; outputPath: string }> = [];
    const result = await approvePageLayout({
      targetDir,
      reportPath,
      approvedAt,
      userNotes: "Page approved",
      localBaseUrl: "http://127.0.0.1:3000",
      screenshotCapturer: async ({ pageUrl, viewport, outputPath }) => {
        captured.push({ pageUrl, viewport, outputPath });
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, `page-baseline-${viewport}`);
      },
    });

    expect(result.ok).toBe(true);
    expect(captured).toEqual([390, 768, 1440].map(viewport => ({
      pageUrl: "http://127.0.0.1:3000/home",
      viewport,
      outputPath: paths.approvedBaseline({ kind: "page", slugOrName: "home", viewport }),
    })));
    expect(PageLayoutApprovalSchema.parse(
      JSON.parse(readFileSync(paths.pageApproval("home"), "utf8")),
    )).toEqual({
      kind: "page-layout",
      approvedAt,
      artifactVersion,
      userNotes: "Page approved",
      slug: "home",
      componentGroupIds: ["group-header", "group-hero"],
      pageReferenceVersion,
    });
    expect(ApprovedBaselineSchema.parse(
      JSON.parse(readFileSync(paths.approvedBaselineManifest({
        kind: "page",
        slugOrName: "home",
      }), "utf8")),
    )).toEqual({
      approvalRef: `page-layout:${artifactVersion}:home`,
      kind: "page",
      capturedAt: approvedAt,
      regressionThreshold: 0.001,
      screenshots: [390, 768, 1440].map(viewport => ({
        viewport,
        path: paths.approvedBaseline({ kind: "page", slugOrName: "home", viewport }),
        sha256: sha256(`page-baseline-${viewport}`),
      })),
    });
  });

  it("rejects approval when a dependent component approval is stale", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "approve-page-layout-"));
    const paths = migrationPaths(targetDir);
    const reportPath = join(targetDir, ".migration/reports/page-assembly/home.json");
    const screenshotCapturer = vi.fn();
    writeJson(paths.approvedInventory, approvedInventory());
    writeComponentApproval(targetDir, "group-header", "SiteHeader");
    writeComponentApproval(targetDir, "group-hero", "Hero", {
      staleSince: "2026-05-07T13:00:00.000Z",
    });
    writeJson(reportPath, pageReport(targetDir));

    const result = await approvePageLayout({
      targetDir,
      reportPath,
      approvedAt,
      screenshotCapturer,
    });

    expect(result).toEqual({
      ok: false,
      reason: "stale-components",
      componentGroupIds: ["group-hero"],
    });
    expect(screenshotCapturer).not.toHaveBeenCalled();
    expect(existsSync(paths.pageApproval("home"))).toBe(false);
  });
});

function approvedInventory(): ApprovedInventory {
  return {
    approvedAt,
    artifactVersion,
    entries: [
      {
        componentGroupId: "group-header",
        proposedName: "SiteHeader",
        kind: "shell",
        sectionInstanceIds: ["p0-s0"],
        implementationName: "SiteHeader",
        filePath: "src/components/SiteHeader.tsx",
      },
      {
        componentGroupId: "group-hero",
        proposedName: "Hero",
        kind: "content",
        sectionInstanceIds: ["p0-s1"],
        implementationName: "Hero",
        filePath: "src/components/Hero.tsx",
      },
    ],
  };
}

function pageReport(targetDir: string) {
  return {
    kind: "page-assembly-report",
    slug: "home",
    artifactVersion,
    pageReferenceVersion,
    generatedAt: "2026-05-07T12:15:00.000Z",
    componentGroupIds: ["group-header", "group-hero"],
    pagePath: join(targetDir, "src/app/home/page.tsx"),
    build: { exitCode: 0, stdout: "built", stderr: "", packageManager: "pnpm" },
    verification: "PASS",
    referencePaths: [],
    screenshotPaths: [],
    diffPaths: [],
    failingViewports: [],
    error: null,
    results: [],
  };
}

function writeComponentApproval(
  targetDir: string,
  componentGroupId: string,
  implementationName: string,
  overrides: Partial<Record<string, unknown>> = {},
): void {
  writeJson(migrationPaths(targetDir).componentApproval(componentGroupId), ComponentBatchApprovalSchema.parse({
    kind: "component-batch",
    approvedAt,
    artifactVersion,
    componentGroupIds: [componentGroupId],
    implementationNames: [implementationName],
    ...overrides,
  }));
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
