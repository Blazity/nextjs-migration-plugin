import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { hashArtifact } from "../lib/artifact-hash.ts";
import { createDefaultDispatchers, defaultDispatchers, resumeMigration } from "../lib/continue.ts";
import { migrationPaths } from "../lib/migration-paths.ts";
import type { ApprovedInventory } from "../schemas/approved-inventory.ts";
import type { DraftInventory } from "../schemas/draft-inventory.ts";

const now = "2026-05-07T12:00:00.000Z";

describe("resumeMigration", () => {
  it("wires a default component-batch dispatcher for guided continue", () => {
    expect(defaultDispatchers()?.implementComponentBatch).toBeTypeOf("function");
  });

  it("wires a default page-assembly dispatcher for guided continue", () => {
    expect(defaultDispatchers()?.assemblePage).toBeTypeOf("function");
  });

  it("runs guided extraction before the default component-batch dispatcher", async () => {
    const calls: string[] = [];
    const dispatchers = createDefaultDispatchers({
      ensureGuidedExtractionReady: async () => {
        calls.push("extract");
      },
      runComponentBatch: async () => {
        calls.push("batch");
      },
    });

    await dispatchers?.implementComponentBatch?.({
      targetDir: "/target",
      artifactVersion: "abcdefabcdef1234",
      batch: [],
    });

    expect(calls).toEqual(["extract", "batch"]);
  });

  it("does not run a component batch when guided extraction fails", async () => {
    const runComponentBatch = vi.fn();
    const dispatchers = createDefaultDispatchers({
      ensureGuidedExtractionReady: async () => {
        throw new Error("missing adapter");
      },
      runComponentBatch,
    });

    await expect(dispatchers?.implementComponentBatch?.({
      targetDir: "/target",
      artifactVersion: "abcdefabcdef1234",
      batch: [],
    })).rejects.toThrow("missing adapter");

    expect(runComponentBatch).not.toHaveBeenCalled();
  });

  it("returns not-initialized when there is no .migration directory", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "cont-"));

    await expect(resumeMigration(targetDir, {})).resolves.toEqual({
      kind: "not-initialized",
    });
  });

  it("returns awaiting-approval at the component inventory review gate", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "cont-"));
    const draft = draftInventory();
    writeJson(migrationPaths(targetDir).draftInventory, draft);

    await expect(resumeMigration(targetDir, {})).resolves.toEqual({
      kind: "awaiting-approval",
      approval: "component-inventory",
      artifactVersion: hashArtifact(draft),
      reviewHtmlPath: migrationPaths(targetDir).reviewHtml,
    });
  });

  it("dispatches the next component batch after inventory approval", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "cont-"));
    const draft = draftInventory();
    const paths = migrationPaths(targetDir);
    writeJson(paths.draftInventory, draft);
    writeJson(paths.approvedInventory, approvedInventory(draft));
    const implementComponentBatch = vi.fn(async () => {});

    const result = await resumeMigration(targetDir, {
      dispatchers: { implementComponentBatch },
    });

    expect(result).toEqual({
      kind: "dispatched",
      action: "implement-component-batch",
      componentGroupIds: ["group-header", "group-hero"],
    });
    expect(implementComponentBatch).toHaveBeenCalledWith({
      targetDir,
      artifactVersion: hashArtifact(draft),
      batch: expect.arrayContaining([
        expect.objectContaining({ componentGroupId: "group-header" }),
        expect.objectContaining({ componentGroupId: "group-hero" }),
      ]),
    });
  });

  it("returns the scheduled component batch when no component implementer is wired", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "cont-"));
    const draft = draftInventory();
    const paths = migrationPaths(targetDir);
    writeJson(paths.draftInventory, draft);
    writeJson(paths.approvedInventory, approvedInventory(draft));

    await expect(resumeMigration(targetDir, {})).resolves.toEqual({
      kind: "no-dispatcher",
      action: "implement-component-batch",
      artifactVersion: hashArtifact(draft),
      componentGroupIds: ["group-header", "group-hero"],
    });
  });

  it("returns approval-stale when the component inventory approval is stale", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "cont-"));
    const draft = draftInventory();
    const paths = migrationPaths(targetDir);
    writeJson(paths.draftInventory, draft);
    writeJson(paths.approvedInventory, {
      ...approvedInventory(draft),
      artifactVersion: "1234567890abcdef",
      staleSince: "2026-05-07T13:00:00.000Z",
    });

    await expect(resumeMigration(targetDir, {})).resolves.toEqual({
      kind: "approval-stale",
      approval: "component-inventory",
      reason: "Component Inventory Review changed after approval. Re-review the regenerated inventory before continuing.",
      reviewHtmlPath: paths.reviewHtml,
      staleSince: "2026-05-07T13:00:00.000Z",
    });
  });
});

function draftInventory(): DraftInventory {
  return {
    generatedAt: now,
    revision: 1,
    entries: [
      {
        componentGroupId: "group-header",
        proposedName: "SiteHeader",
        kind: "shell",
        sectionInstanceIds: ["p0-s0", "p1-s0"],
      },
      {
        componentGroupId: "group-hero",
        proposedName: "Hero",
        kind: "content",
        sectionInstanceIds: ["p0-s1"],
      },
    ],
  };
}

function approvedInventory(draft: DraftInventory): ApprovedInventory {
  return {
    approvedAt: now,
    artifactVersion: hashArtifact(draft),
    entries: draft.entries.map(component => ({
      ...component,
      implementationName: component.proposedName,
      filePath: `src/components/${component.proposedName}.tsx`,
    })),
  };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
