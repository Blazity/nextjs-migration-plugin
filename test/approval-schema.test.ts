import { describe, expect, it } from "vitest";
import { ApprovalRecordSchema } from "../schemas/approval.ts";

const approvedAt = "2026-05-07T12:00:00.000Z";
const artifactVersion = "0123456789abcdef";

const componentInventoryApproval = {
  kind: "component-inventory",
  approvedAt,
  artifactVersion,
  entries: [
    { componentGroupId: "hero-primary", implementationName: "Hero" },
    { componentGroupId: "site-header", implementationName: "SiteHeader" },
  ],
  userNotes: "Approved inventory names.",
};

const componentBatchApproval = {
  kind: "component-batch",
  approvedAt,
  artifactVersion,
  componentGroupIds: ["hero-primary", "site-header"],
  implementationNames: ["Hero", "SiteHeader"],
};

const pageLayoutApproval = {
  kind: "page-layout",
  approvedAt,
  artifactVersion,
  slug: "pricing",
  componentGroupIds: ["site-header", "pricing-card"],
  pageReferenceVersion: "fedcba9876543210",
};

describe("ApprovalRecordSchema", () => {
  it.each([
    ["component inventory", componentInventoryApproval],
    ["component batch", componentBatchApproval],
    ["page layout", pageLayoutApproval],
  ])("accepts a valid %s approval", (_label, approval) => {
    const result = ApprovalRecordSchema.safeParse(approval);

    expect(result.success).toBe(true);
  });

  it("requires artifactVersion", () => {
    const { artifactVersion: _artifactVersion, ...approvalWithoutArtifactVersion } =
      componentBatchApproval;

    const result = ApprovalRecordSchema.safeParse(approvalWithoutArtifactVersion);

    expect(result.success).toBe(false);
  });

  it("accepts approvals without staleSince", () => {
    const result = ApprovalRecordSchema.safeParse(componentBatchApproval);

    expect(result.success).toBe(true);
  });

  it("accepts approvals with staleSince", () => {
    const result = ApprovalRecordSchema.safeParse({
      ...componentBatchApproval,
      staleSince: "2026-05-07T13:00:00.000Z",
    });

    expect(result.success).toBe(true);
  });

  it("rejects artifactVersion values that are not 16 lowercase hex characters", () => {
    const result = ApprovalRecordSchema.safeParse({
      ...componentBatchApproval,
      artifactVersion: "not-a-valid-hash",
    });

    expect(result.success).toBe(false);
  });

  it("rejects component-batch approvals with mismatched ids and names", () => {
    const result = ApprovalRecordSchema.safeParse({
      ...componentBatchApproval,
      componentGroupIds: ["hero-primary", "site-header"],
      implementationNames: ["Hero"],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(issue => issue.path.join(".") === "implementationNames")).toBe(true);
    }
  });

  it("rejects unknown fields", () => {
    const result = ApprovalRecordSchema.safeParse({
      ...componentBatchApproval,
      unexpected: true,
    });

    expect(result.success).toBe(false);
  });
});
