import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractCssUrl, writeImageOutput } from "../scripts/lib/extract-images-core.ts";

describe("writeImageOutput", () => {
  it("extracts quoted CSS URLs that contain parentheses", () => {
    expect(extractCssUrl('url("https://cdn.example.com/assets/hero%20(1).webp")')).toBe(
      "https://cdn.example.com/assets/hero%20(1).webp",
    );
  });

  it("does not duplicate domain/page segments when image base is nested", async () => {
    const root = mkdtempSync(join(tmpdir(), "image-output-"));
    const imageBaseDir = join(root, "public/images/example.com/page");
    const manifestDir = join(root, "docs/specs/page");

    await writeImageOutput(
      {
        url: "https://example.com/",
        totalImages: 0,
        shellSections: [],
        sections: [{
          index: 0,
          label: "01-hero",
          images: [],
          inlineSvgs: [{
            outerHTML: "<svg><path /></svg>",
            localPath: "images/example.com/page/01-hero/logo.svg",
            alt: "Logo",
            width: 10,
            height: 10,
            parentTag: "a",
            parentClassName: "brand",
            nearestHref: "https://example.com/",
            nearestText: "",
            roleHint: "logo",
            domOrder: 0,
          }],
        }],
      },
      imageBaseDir,
      manifestDir,
    );

    const expectedPath = join(root, "public/images/example.com/page/01-hero/logo.svg");
    const doubledPath = join(root, "public/images/example.com/page/example.com/page/01-hero/logo.svg");
    expect(existsSync(expectedPath)).toBe(true);
    expect(existsSync(doubledPath)).toBe(false);
    expect(readFileSync(expectedPath, "utf8")).toMatch(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  });

  it("writes a manifest with failedDownloads when one image download fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "image-output-"));
    const imageBaseDir = join(root, "public/images");
    const manifestDir = join(root, "docs/specs/page");

    await (writeImageOutput as unknown as (
      result: Parameters<typeof writeImageOutput>[0],
      imageBaseDir: string,
      manifestDir: string,
      deps: { downloadFile: (url: string, dest: string) => Promise<void> },
    ) => Promise<void>)(
      {
        url: "https://example.com/",
        totalImages: 2,
        shellSections: [],
        sections: [{
          index: 0,
          label: "01-hero",
          inlineSvgs: [],
          images: [
            {
              originalUrl: "https://example.com/ok.png",
              localPath: "images/example.com/page/01-hero/ok.png",
              alt: "OK",
              dimensions: { x: 0, y: 0, width: 10, height: 10 },
              type: "img",
              parentClassName: "hero",
            },
            {
              originalUrl: "https://example.com/missing.png",
              localPath: "images/example.com/page/01-hero/missing.png",
              alt: "Missing",
              dimensions: { x: 10, y: 0, width: 10, height: 10 },
              type: "img",
              parentClassName: "hero",
            },
          ],
        }],
      },
      imageBaseDir,
      manifestDir,
      {
        downloadFile: async (url, dest) => {
          if (url.endsWith("/missing.png")) throw new Error("HTTP 403");
          writeFileSync(dest, "PNG");
        },
      },
    );

    expect(existsSync(join(root, "public/images/example.com/page/01-hero/ok.png"))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(manifestDir, "image-manifest.json"), "utf8"));
    expect(manifest.failedDownloads).toEqual([{
      url: "https://example.com/missing.png",
      localPath: "images/example.com/page/01-hero/missing.png",
      error: "Error: HTTP 403",
    }]);
  });
});
