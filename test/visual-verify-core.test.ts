import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import {
  assessVisualSimilarity,
  diffNormalizedPngs,
} from "../scripts/lib/visual-verify-core.ts";

describe("visual similarity", () => {
  it("scores identical images as 1 while retaining raw pixel diagnostics", () => {
    const ref = imageWithRect({ x: 0, y: 8, width: 20, height: 4 });
    const local = imageWithRect({ x: 0, y: 8, width: 20, height: 4 });

    const result = assessVisualSimilarity({ refPng: ref, localPng: local });

    expect(result.similarity).toBe(1);
    expect(result.pixelDiffRatio).toBe(0);
    expect(result.bestOffset).toEqual({ x: 0, y: 0 });
  });

  it("tolerates small vertical offsets better than raw pixel diff", () => {
    const ref = imageWithRect({ x: 0, y: 4, width: 20, height: 8 });
    const local = imageWithRect({ x: 0, y: 8, width: 20, height: 8 });
    const raw = diffNormalizedPngs(ref, local);

    const result = assessVisualSimilarity({
      refPng: ref,
      localPng: local,
      maxOffsetPx: 6,
    });

    expect(raw.ratio).toBeGreaterThan(0.3);
    expect(result.similarity).toBeGreaterThanOrEqual(0.92);
    expect(result.bestOffset).toEqual({ x: 0, y: -4 });
    expect(result.pixelDiffRatio).toBe(raw.ratio);
  });

  it("keeps structurally different images below the readiness band", () => {
    const horizontal = imageWithRect({ x: 0, y: 8, width: 20, height: 4 });
    const vertical = imageWithRect({ x: 8, y: 0, width: 4, height: 20 });

    const result = assessVisualSimilarity({
      refPng: horizontal,
      localPng: vertical,
      maxOffsetPx: 6,
    });

    expect(result.similarity).toBeLessThan(0.92);
  });
});

function imageWithRect(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): PNG {
  const png = new PNG({ width: 20, height: 20 });
  fill(png, 255);
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const index = (png.width * y + x) << 2;
      png.data[index] = 0;
      png.data[index + 1] = 0;
      png.data[index + 2] = 0;
      png.data[index + 3] = 255;
    }
  }
  return png;
}

function fill(png: PNG, value: number): void {
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = value;
    png.data[index + 1] = value;
    png.data[index + 2] = value;
    png.data[index + 3] = 255;
  }
}
