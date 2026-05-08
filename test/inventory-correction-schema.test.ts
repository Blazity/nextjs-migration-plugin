import { describe, expect, it } from "vitest";
import { InventoryCorrectionSchema } from "../schemas/inventory-correction.ts";

describe("InventoryCorrectionSchema", () => {
  it.each([
    ["rename", { type: "rename", componentGroupId: "group-hero", newName: "Hero" }],
    ["merge", { type: "merge", targetGroupId: "group-hero", sourceGroupIds: ["group-stats"] }],
    [
      "split",
      {
        type: "split",
        sourceGroupId: "group-hero",
        sectionInstanceIds: ["p0-s2"],
        newGroupName: "Stats",
        newKind: "shell",
      },
    ],
    ["set-kind", { type: "set-kind", componentGroupId: "group-footer", kind: "shell" }],
    ["note", { type: "note", componentGroupId: "group-footer", note: "Shared across most pages." }],
  ])("accepts a valid %s operation", (_operationType, operation) => {
    expect(InventoryCorrectionSchema.safeParse(operation).success).toBe(true);
  });

  it("requires rename operations to include a component group id and new name", () => {
    const missingGroupId = InventoryCorrectionSchema.safeParse({ type: "rename", newName: "Hero" });
    const missingNewName = InventoryCorrectionSchema.safeParse({ type: "rename", componentGroupId: "group-hero" });

    expect(missingGroupId.success).toBe(false);
    expect(missingNewName.success).toBe(false);
  });

  it("requires merge operations to include at least one source group id", () => {
    const result = InventoryCorrectionSchema.safeParse({
      type: "merge",
      targetGroupId: "group-hero",
      sourceGroupIds: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(issue => issue.path.join(".") === "sourceGroupIds")).toBe(true);
    }
  });

  it("allows split operations to omit the new kind", () => {
    const result = InventoryCorrectionSchema.safeParse({
      type: "split",
      sourceGroupId: "group-hero",
      sectionInstanceIds: ["p0-s2"],
      newGroupName: "Stats",
    });

    expect(result.success).toBe(true);
  });

  it("rejects unknown keys on operation variants", () => {
    const result = InventoryCorrectionSchema.safeParse({
      type: "set-kind",
      componentGroupId: "group-footer",
      kind: "shell",
      unexpected: true,
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid component kinds", () => {
    const result = InventoryCorrectionSchema.safeParse({
      type: "set-kind",
      componentGroupId: "group-footer",
      kind: "widget",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(issue => issue.path.join(".") === "kind")).toBe(true);
    }
  });
});
