import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkApprovalStaleness } from "../lib/approval-staleness.ts";
import { hashArtifact } from "../lib/artifact-hash.ts";
import { approveDraftInventory } from "../lib/inventory-approval.ts";
import { migrationPaths } from "../lib/migration-paths.ts";
import type { DraftInventory } from "../schemas/draft-inventory.ts";

const now = "2026-05-07T13:00:00.000Z";

function draftInventory(name = "Hero"): DraftInventory {
  return {
    generatedAt: "2026-05-07T12:00:00.000Z",
    revision: 1,
    entries: [
      {
        componentGroupId: "group-hero",
        proposedName: name,
        kind: "content",
        sectionInstanceIds: ["p0-s0"],
      },
      {
        componentGroupId: "group-footer",
        proposedName: "Footer",
        kind: "shell",
        sectionInstanceIds: ["p0-s1"],
      },
    ],
  };
}

describe("checkApprovalStaleness", () => {
  it("marks component inventory approval stale when the draft artifact changes", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "approval-stale-"));
    const paths = migrationPaths(targetDir);
    const previousDraft = draftInventory();
    const currentDraft = draftInventory("HomepageHero");
    writeJson(paths.draftInventory, currentDraft);
    writeJson(paths.approvedInventory, {
      kind: "component-inventory",
      approvedAt: "2026-05-07T12:30:00.000Z",
      artifactVersion: hashArtifact(previousDraft),
      entries: [{ componentGroupId: "group-hero", implementationName: "Hero" }],
    });

    const result = checkApprovalStaleness({ targetDir, now: () => now });

    expect(result.staleApprovals).toEqual(["component-inventory"]);
    expect(JSON.parse(readFileSync(paths.approvedInventory, "utf8")).staleSince).toBe(now);
  });

  it("reads the approved inventory written by the approval gate", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "approval-stale-"));
    const paths = migrationPaths(targetDir);
    const previousDraft = draftInventory();
    writeJson(paths.draftInventory, previousDraft);
    await approveDraftInventory({
      targetDir,
      draftInventory: previousDraft,
      approvedAt: "2026-05-07T12:30:00.000Z",
    });
    writeJson(paths.draftInventory, draftInventory("HomepageHero"));

    const result = checkApprovalStaleness({ targetDir, now: () => now });

    expect(result.staleApprovals).toEqual(["component-inventory"]);
    expect(JSON.parse(readFileSync(paths.approvedInventory, "utf8")).staleSince).toBe(now);
  });

  it("marks dependent component approvals stale and preserves independent approvals", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "approval-stale-"));
    const paths = migrationPaths(targetDir);
    const previousDraft = draftInventory();
    const currentDraft = draftInventory("HomepageHero");
    writeJson(paths.draftInventory, currentDraft);
    writeJson(paths.approvedInventory, {
      kind: "component-inventory",
      approvedAt: "2026-05-07T12:30:00.000Z",
      artifactVersion: hashArtifact(previousDraft),
      entries: [
        { componentGroupId: "group-hero", implementationName: "Hero" },
        { componentGroupId: "group-footer", implementationName: "Footer" },
      ],
    });
    writeJson(paths.componentApproval("group-hero"), {
      kind: "component-batch",
      approvedAt: "2026-05-07T12:40:00.000Z",
      artifactVersion: hashArtifact(previousDraft),
      componentGroupIds: ["group-hero"],
      implementationNames: ["Hero"],
    });
    writeJson(paths.componentApproval("group-footer"), {
      kind: "component-batch",
      approvedAt: "2026-05-07T12:40:00.000Z",
      artifactVersion: hashArtifact(previousDraft),
      componentGroupIds: ["group-footer"],
      implementationNames: ["Footer"],
    });

    const result = checkApprovalStaleness({ targetDir, now: () => now });

    expect(result.staleApprovals).toEqual(["component-inventory", "components/group-hero"]);
    expect(JSON.parse(readFileSync(paths.componentApproval("group-hero"), "utf8")).staleSince).toBe(now);
    expect(JSON.parse(readFileSync(paths.componentApproval("group-footer"), "utf8")).staleSince).toBeUndefined();
  });

  it("marks dependent component approvals stale when group membership changes but the name stays the same", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "approval-stale-"));
    const paths = migrationPaths(targetDir);
    const previousDraft = draftInventory();
    const currentDraft = {
      ...previousDraft,
      revision: 2,
      entries: [
        {
          ...previousDraft.entries[0],
          sectionInstanceIds: ["p0-s0", "p2-s0"],
        },
        previousDraft.entries[1],
      ],
    };
    writeJson(paths.draftInventory, currentDraft);
    writeJson(paths.approvedInventory, {
      approvedAt: "2026-05-07T12:30:00.000Z",
      artifactVersion: hashArtifact(previousDraft),
      entries: [
        {
          ...previousDraft.entries[0],
          implementationName: "Hero",
          filePath: "src/components/Hero.tsx",
        },
        {
          ...previousDraft.entries[1],
          implementationName: "Footer",
          filePath: "src/components/Footer.tsx",
        },
      ],
    });
    writeJson(paths.componentApproval("group-hero"), {
      kind: "component-batch",
      approvedAt: "2026-05-07T12:40:00.000Z",
      artifactVersion: hashArtifact(previousDraft),
      componentGroupIds: ["group-hero"],
      implementationNames: ["Hero"],
    });

    const result = checkApprovalStaleness({ targetDir, now: () => now });

    expect(result.staleApprovals).toEqual(["component-inventory", "components/group-hero"]);
  });
});

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
