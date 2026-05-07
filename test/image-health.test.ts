import { describe, expect, it } from "vitest";
import { summarizeBrokenImages } from "../scripts/lib/image-health.ts";

describe("summarizeBrokenImages", () => {
  it("fails when rendered images are broken", () => {
    const result = summarizeBrokenImages([
      { src: "/images/missing-logo.svg", alt: "Logo", naturalWidth: 0, naturalHeight: 0 },
    ]);

    expect(result.passed).toBe(false);
    expect(result.detail ?? "").toMatch(/missing-logo\.svg/);
  });
});
