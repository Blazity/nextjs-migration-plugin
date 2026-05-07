import { describe, expect, it } from "vitest";
import { ApprovedInventorySchema } from "../schemas/approved-inventory.ts";

const validApprovedInventory = {
  approvedAt: "2026-05-07T12:00:00.000Z",
  artifactVersion: "0123456789abcdef",
  entries: [
    {
      componentGroupId: "group-hero",
      proposedName: "Hero",
      implementationName: "Hero",
      filePath: "src/components/Hero.tsx",
      kind: "content",
      sectionInstanceIds: ["p0-s0"],
    },
  ],
};

describe("ApprovedInventorySchema", () => {
  it.each(["Hero", "PricingCard", "SiteHeader"])("accepts semantic PascalCase implementation name %s", implementationName => {
    const approvedInventory = {
      ...validApprovedInventory,
      entries: [
        {
          ...validApprovedInventory.entries[0],
          implementationName,
          filePath: `src/components/${implementationName}.tsx`,
        },
      ],
    };

    expect(ApprovedInventorySchema.safeParse(approvedInventory).success).toBe(true);
  });

  it.each(["Component3", "p0-s0", "Section1"])("rejects generic or ID-like implementation name %s", implementationName => {
    const approvedInventory = {
      ...validApprovedInventory,
      entries: [
        {
          ...validApprovedInventory.entries[0],
          implementationName,
          filePath: "src/components/Hero.tsx",
        },
      ],
    };

    const result = ApprovedInventorySchema.safeParse(approvedInventory);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(issue => issue.path.join(".") === "entries.0.implementationName")).toBe(true);
    }
  });

  it("rejects a file path that does not match the approved implementation name", () => {
    const result = ApprovedInventorySchema.safeParse({
      ...validApprovedInventory,
      entries: [
        {
          ...validApprovedInventory.entries[0],
          implementationName: "Hero",
          filePath: "src/components/Component3.tsx",
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(issue => issue.path.join(".") === "entries.0.filePath")).toBe(true);
    }
  });

  it("accepts staleSince after an approved inventory becomes stale", () => {
    expect(ApprovedInventorySchema.safeParse({
      ...validApprovedInventory,
      staleSince: "2026-05-07T13:00:00.000Z",
    }).success).toBe(true);
  });
});
