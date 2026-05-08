import { describe, expect, it } from "vitest";
import { applyCorrections } from "../lib/apply-inventory-corrections.ts";
import { hashArtifact } from "../lib/artifact-hash.ts";
import type { DraftInventory } from "../schemas/draft-inventory.ts";
import type { InventoryCorrection } from "../schemas/inventory-correction.ts";

const generatedAt = "2026-05-07T12:00:00.000Z";

function draftInventory(): DraftInventory {
  return {
    generatedAt,
    revision: 0,
    entries: [
      {
        componentGroupId: "group-one",
        proposedName: "Component1",
        kind: "content",
        sectionInstanceIds: ["p0-s0", "p0-s2"],
      },
      {
        componentGroupId: "group-two",
        proposedName: "Component2",
        kind: "content",
        sectionInstanceIds: ["p0-s1"],
      },
    ],
  };
}

describe("applyCorrections", () => {
  it("renames an inventory entry and increments the revision", () => {
    const before = draftInventory();
    const after = applyCorrections(before, [
      { type: "rename", componentGroupId: "group-one", newName: "Hero" },
    ]);

    expect(after.revision).toBe(1);
    expect(after.entries[0]).toMatchObject({
      componentGroupId: "group-one",
      proposedName: "Hero",
      sectionInstanceIds: ["p0-s0", "p0-s2"],
    });
    expect(hashArtifact(after)).not.toBe(hashArtifact(before));
  });

  it("merges source groups into a target group", () => {
    const after = applyCorrections(draftInventory(), [
      { type: "merge", targetGroupId: "group-one", sourceGroupIds: ["group-two"] },
    ]);

    expect(after.revision).toBe(1);
    expect(after.entries).toHaveLength(1);
    expect(after.entries[0]).toMatchObject({
      componentGroupId: "group-one",
      sectionInstanceIds: ["p0-s0", "p0-s2", "p0-s1"],
    });
  });

  it("rejects self-merge corrections without mutating the draft", () => {
    const before = draftInventory();

    expect(() => applyCorrections(before, [
      { type: "merge", targetGroupId: "group-one", sourceGroupIds: ["group-one"] },
    ])).toThrow(/Cannot merge a group into itself/);

    expect(before.entries).toHaveLength(2);
  });

  it("splits selected section instances into a new group", () => {
    const after = applyCorrections(draftInventory(), [
      {
        type: "split",
        sourceGroupId: "group-one",
        sectionInstanceIds: ["p0-s2"],
        newGroupName: "Stats",
        newKind: "shell",
      },
    ]);

    expect(after.revision).toBe(1);
    expect(after.entries).toEqual([
      {
        componentGroupId: "group-one",
        proposedName: "Component1",
        kind: "content",
        sectionInstanceIds: ["p0-s0"],
      },
      {
        componentGroupId: "group-one-split-1",
        proposedName: "Stats",
        kind: "shell",
        sectionInstanceIds: ["p0-s2"],
      },
      {
        componentGroupId: "group-two",
        proposedName: "Component2",
        kind: "content",
        sectionInstanceIds: ["p0-s1"],
      },
    ]);
  });

  it("applies set-kind and note operations", () => {
    const corrections: InventoryCorrection[] = [
      { type: "set-kind", componentGroupId: "group-two", kind: "shell" },
      { type: "note", componentGroupId: "group-two", note: "Likely shared footer." },
    ];

    const after = applyCorrections(draftInventory(), corrections);

    expect(after.revision).toBe(1);
    expect(after.entries[1]).toMatchObject({
      kind: "shell",
      notes: "Likely shared footer.",
    });
  });
});
