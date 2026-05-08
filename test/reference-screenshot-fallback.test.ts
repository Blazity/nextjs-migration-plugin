import { describe, expect, it } from "vitest";
import { createWriteStream, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { cropReferenceScreenshotFallback } from "../lib/reference-screenshot-fallback.ts";

describe("cropReferenceScreenshotFallback", () => {
  it("crops a section image from an existing full-page reference screenshot", async () => {
    const dir = mkdtempSync(join(tmpdir(), "reference-fallback-"));
    const fullPagePath = join(dir, "full.png");
    const outputPath = join(dir, "section.png");
    const fullPage = new PNG({ width: 4, height: 4 });

    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const offset = (fullPage.width * y + x) << 2;
        fullPage.data[offset] = x * 40;
        fullPage.data[offset + 1] = y * 40;
        fullPage.data[offset + 2] = 10;
        fullPage.data[offset + 3] = 255;
      }
    }

    await new Promise<void>((resolve, reject) => {
      fullPage.pack().pipe(createWriteStream(fullPagePath))
        .on("finish", resolve)
        .on("error", reject);
    });

    cropReferenceScreenshotFallback({
      fullPagePath,
      outputPath,
      boundingBox: { x: 1, y: 1, width: 2, height: 2 },
    });

    expect(existsSync(outputPath)).toBe(true);
    const cropped = PNG.sync.read(readFileSync(outputPath));
    expect(cropped.width).toBe(2);
    expect(cropped.height).toBe(2);
    expect([...cropped.data.slice(0, 4)]).toEqual([40, 40, 10, 255]);
  });
});
