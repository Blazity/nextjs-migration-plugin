import { describe, expect, it } from "vitest";
import { DraftInventorySchema } from "../schemas/draft-inventory.ts";

const validDraftInventory = {
  generatedAt: "2026-05-07T12:00:00.000Z",
  revision: 0,
  entries: [
    {
      componentGroupId: "group-hero",
      proposedName: "Hero",
      kind: "content",
      sectionInstanceIds: ["p0-s0"],
    },
  ],
};

describe("DraftInventorySchema", () => {
  it("accepts a minimal valid draft inventory record", () => {
    expect(DraftInventorySchema.safeParse(validDraftInventory).success).toBe(true);
  });

  it.each(["Component1", "p0-s0", "UnnamedGroup1"])(
    "accepts half-finished proposed name %s because semantic enforcement happens at approval time",
    proposedName => {
      const draft = {
        ...validDraftInventory,
        entries: [
          {
            componentGroupId: "group-placeholder",
            proposedName,
            kind: "shell",
            sectionInstanceIds: ["p0-s0"],
            notes: "Needs user rename before approval.",
          },
        ],
      };

      expect(DraftInventorySchema.safeParse(draft).success).toBe(true);
    }
  );

  it("rejects empty section instance ids", () => {
    const draft = {
      ...validDraftInventory,
      entries: [
        {
          componentGroupId: "group-empty",
          proposedName: "Hero",
          kind: "content",
          sectionInstanceIds: [],
        },
      ],
    };

    const result = DraftInventorySchema.safeParse(draft);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(issue => issue.path.join(".") === "entries.0.sectionInstanceIds")).toBe(true);
    }
  });

  it("rejects an invalid component kind", () => {
    const draft = {
      ...validDraftInventory,
      entries: [
        {
          componentGroupId: "group-kind",
          proposedName: "Hero",
          kind: "widget",
          sectionInstanceIds: ["p0-s0"],
        },
      ],
    };

    const result = DraftInventorySchema.safeParse(draft);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(issue => issue.path.join(".") === "entries.0.kind")).toBe(true);
    }
  });

  it("rejects unknown keys at the root and entry levels", () => {
    const rootResult = DraftInventorySchema.safeParse({
      ...validDraftInventory,
      unexpected: true,
    });
    const entryResult = DraftInventorySchema.safeParse({
      ...validDraftInventory,
      entries: [
        {
          ...validDraftInventory.entries[0],
          unexpected: true,
        },
      ],
    });

    expect(rootResult.success).toBe(false);
    expect(entryResult.success).toBe(false);
  });
});
