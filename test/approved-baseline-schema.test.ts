import { describe, expect, it } from "vitest";
import { ApprovedBaselineSchema } from "../schemas/approved-baseline.ts";

const approvedBaseline = {
  approvalRef: "component-batch:0123456789abcdef",
  kind: "component",
  capturedAt: "2026-05-07T12:00:00.000Z",
  screenshots: [
    {
      viewport: 390,
      path: "screenshots/hero-mobile.png",
      sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
  ],
};

describe("ApprovedBaselineSchema", () => {
  it("applies the default regression threshold", () => {
    const result = ApprovedBaselineSchema.safeParse(approvedBaseline);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.regressionThreshold).toBe(0.001);
    }
  });

  it.each([0, -0.001, 0.050001])(
    "rejects regression threshold %s outside the approved range",
    (regressionThreshold) => {
      const result = ApprovedBaselineSchema.safeParse({
        ...approvedBaseline,
        regressionThreshold,
      });

      expect(result.success).toBe(false);
    },
  );

  it.each([0.001, 0.05])("accepts regression threshold %s", (regressionThreshold) => {
    const result = ApprovedBaselineSchema.safeParse({
      ...approvedBaseline,
      regressionThreshold,
    });

    expect(result.success).toBe(true);
  });

  it("rejects approved baselines without screenshots", () => {
    const result = ApprovedBaselineSchema.safeParse({
      ...approvedBaseline,
      screenshots: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects baseline screenshots without usable paths or hashes", () => {
    const result = ApprovedBaselineSchema.safeParse({
      ...approvedBaseline,
      screenshots: [
        {
          viewport: 390,
          path: "",
          sha256: "not-a-hash",
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(issue => issue.path.join(".") === "screenshots.0.path")).toBe(true);
      expect(result.error.issues.some(issue => issue.path.join(".") === "screenshots.0.sha256")).toBe(true);
    }
  });

  it("rejects short hex strings for baseline screenshot hashes", () => {
    const result = ApprovedBaselineSchema.safeParse({
      ...approvedBaseline,
      screenshots: [
        {
          ...approvedBaseline.screenshots[0],
          sha256: "0123456789abcdef",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown screenshot fields", () => {
    const result = ApprovedBaselineSchema.safeParse({
      ...approvedBaseline,
      screenshots: [
        {
          ...approvedBaseline.screenshots[0],
          unexpected: true,
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
