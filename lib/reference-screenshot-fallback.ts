import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PNG } from "pngjs";
import type { SectionRecord } from "../schemas/sections.ts";

export type ScreenshotBoundingBox = SectionRecord["boundingBox"];

export function cropReferenceScreenshotFallback(args: {
  fullPagePath: string;
  outputPath: string;
  boundingBox: ScreenshotBoundingBox;
}): void {
  const source = PNG.sync.read(readFileSync(args.fullPagePath));
  const clip = normalizeClip(args.boundingBox, source.width, source.height);
  if (!clip) {
    throw new Error("Cannot crop fallback screenshot from an empty or out-of-bounds bounding box");
  }

  const output = new PNG({ width: clip.width, height: clip.height });
  for (let y = 0; y < clip.height; y++) {
    for (let x = 0; x < clip.width; x++) {
      const sourceOffset = (source.width * (clip.y + y) + (clip.x + x)) << 2;
      const targetOffset = (clip.width * y + x) << 2;
      output.data[targetOffset] = source.data[sourceOffset];
      output.data[targetOffset + 1] = source.data[sourceOffset + 1];
      output.data[targetOffset + 2] = source.data[sourceOffset + 2];
      output.data[targetOffset + 3] = source.data[sourceOffset + 3];
    }
  }

  mkdirSync(dirname(args.outputPath), { recursive: true });
  writeFileSync(args.outputPath, PNG.sync.write(output));
}

function normalizeClip(
  boundingBox: ScreenshotBoundingBox,
  sourceWidth: number,
  sourceHeight: number,
): { x: number; y: number; width: number; height: number } | null {
  const x = clamp(Math.floor(boundingBox.x), 0, sourceWidth);
  const y = clamp(Math.floor(boundingBox.y), 0, sourceHeight);
  const width = clamp(Math.ceil(boundingBox.width), 0, sourceWidth - x);
  const height = clamp(Math.ceil(boundingBox.height), 0, sourceHeight - y);
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
