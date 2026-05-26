import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { approveDraftInventory } from "../lib/inventory-approval.ts";
import { hashArtifact } from "../lib/artifact-hash.ts";
import { migrationPaths } from "../lib/migration-paths.ts";
import { ApprovedInventorySchema } from "../schemas/approved-inventory.ts";
import type { DraftInventory } from "../schemas/draft-inventory.ts";

const generatedAt = "2026-05-07T12:00:00.000Z";
const approvedAt = "2026-05-07T12:30:00.000Z";

function cleanDraftInventory(): DraftInventory {
  return {
    generatedAt,
    revision: 0,
    entries: [
      {
        componentGroupId: "group-hero",
        proposedName: "Hero",
        kind: "content",
        sectionInstanceIds: ["p0-s0"],
      },
      {
        componentGroupId: "group-header",
        proposedName: "SiteHeader",
        kind: "shell",
        sectionInstanceIds: ["p0-s1"],
        notes: "Shared navigation shell",
      },
    ],
  };
}

describe("approveDraftInventory", () => {
  it("blocks generic draft names and writes nothing", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "inventory-approval-"));
    const draftInventory: DraftInventory = {
      ...cleanDraftInventory(),
      entries: [
        {
          componentGroupId: "group-generic",
          proposedName: "Component12",
          kind: "content",
          sectionInstanceIds: ["p0-s0"],
        },
        {
          componentGroupId: "group-id-like",
          proposedName: "Hero-p0-s0",
          kind: "content",
          sectionInstanceIds: ["p0-s1"],
        },
        {
          componentGroupId: "group-unnamed",
          proposedName: "UnnamedGroup1",
          kind: "content",
          sectionInstanceIds: ["p0-s2"],
        },
        {
          componentGroupId: "group-pascal-id",
          proposedName: "P0S3",
          kind: "content",
          sectionInstanceIds: ["p0-s3"],
        },
      ],
    };

    const result = await approveDraftInventory({ targetDir, draftInventory, approvedAt });

    expect(result).toEqual({
      ok: false,
      reason: "blocking-names",
      names: ["Component12", "Hero-p0-s0", "UnnamedGroup1", "P0S3"],
    });
    expect(existsSync(migrationPaths(targetDir).approvedInventory)).toBe(false);
  });

  it("blocks non-PascalCase draft names and writes nothing", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "inventory-approval-"));
    const draftInventory: DraftInventory = {
      ...cleanDraftInventory(),
      entries: [
        {
          componentGroupId: "group-hero",
          proposedName: "hero",
          kind: "content",
          sectionInstanceIds: ["p0-s0"],
        },
        {
          componentGroupId: "group-pricing",
          proposedName: "pricing-card",
          kind: "content",
          sectionInstanceIds: ["p0-s1"],
        },
      ],
    };

    const result = await approveDraftInventory({ targetDir, draftInventory, approvedAt });

    expect(result).toEqual({
      ok: false,
      reason: "blocking-names",
      names: ["hero", "pricing-card"],
    });
    expect(existsSync(migrationPaths(targetDir).approvedInventory)).toBe(false);
  });

  it("writes an approved inventory with implementation names, file paths, and draft artifact version", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "inventory-approval-"));
    const draftInventory = cleanDraftInventory();

    const result = await approveDraftInventory({ targetDir, draftInventory, approvedAt });

    expect(result.ok).toBe(true);
    const approved = JSON.parse(readFileSync(migrationPaths(targetDir).approvedInventory, "utf8"));
    expect(ApprovedInventorySchema.safeParse(approved).success).toBe(true);
    expect(approved).toEqual({
      approvedAt,
      artifactVersion: hashArtifact(draftInventory),
      entries: [
        {
          ...draftInventory.entries[0],
          emit: "render",
          implementationName: "Hero",
          filePath: "src/components/Hero.tsx",
        },
        {
          ...draftInventory.entries[1],
          emit: "render",
          implementationName: "SiteHeader",
          filePath: "src/components/SiteHeader.tsx",
        },
      ],
    });
  });

  it("persists user notes and records an inventory approval decision", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "inventory-approval-"));
    const draftInventory = cleanDraftInventory();

    const result = await approveDraftInventory({
      targetDir,
      draftInventory,
      approvedAt,
      userNotes: "Approved after renaming the shared shell.",
    });

    expect(result.ok).toBe(true);
    const paths = migrationPaths(targetDir);
    const approved = JSON.parse(readFileSync(paths.approvedInventory, "utf8"));
    expect(approved.userNotes).toBe("Approved after renaming the shared shell.");

    const decisionFiles = readdirSync(paths.decisionsDir);
    expect(decisionFiles).toHaveLength(1);
    const decision = JSON.parse(readFileSync(join(paths.decisionsDir, decisionFiles[0]), "utf8"));
    expect(decision).toMatchObject({
      kind: "component-inventory-approval",
      actor: "user",
      summary: "Approved Component Inventory Review",
      userNotes: "Approved after renaming the shared shell.",
      artifactVersion: hashArtifact(draftInventory),
    });
  });

  it("preserves approvedAt when the same draft is approved again", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "inventory-approval-"));
    const draftInventory = cleanDraftInventory();

    await approveDraftInventory({ targetDir, draftInventory, approvedAt });
    await approveDraftInventory({
      targetDir,
      draftInventory,
      approvedAt: "2026-05-07T13:00:00.000Z",
    });

    const approved = JSON.parse(readFileSync(migrationPaths(targetDir).approvedInventory, "utf8"));
    expect(approved.approvedAt).toBe(approvedAt);
  });

  it("clears staleSince when re-approving a matching draft", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "inventory-approval-"));
    const draftInventory = cleanDraftInventory();
    const first = await approveDraftInventory({ targetDir, draftInventory, approvedAt });
    if (!first.ok) throw new Error("expected first approval to pass");
    const stale = {
      ...first.approvedInventory,
      staleSince: "2026-05-07T13:00:00.000Z",
    };
    writeJson(migrationPaths(targetDir).approvedInventory, stale);

    await approveDraftInventory({
      targetDir,
      draftInventory,
      approvedAt: "2026-05-07T13:30:00.000Z",
    });

    const approved = JSON.parse(readFileSync(migrationPaths(targetDir).approvedInventory, "utf8"));
    expect(approved.approvedAt).toBe(approvedAt);
    expect(approved.staleSince).toBeUndefined();
  });
});

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
