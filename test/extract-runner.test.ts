import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractPage } from "../lib/extract-runner.ts";
import { PageSpecManifestSchema } from "../schemas/page-spec.ts";

describe("extractPage", () => {
  it("writes a schema-valid manifest after the three extraction steps complete", async () => {
    const root = mkdtempSync(join(tmpdir(), "extract-page-"));
    const pagesDir = join(root, ".migration/pages");
    mkdirSync(pagesDir, { recursive: true });

    const stubStyles = async ({ outputDir }: { outputDir: string }) => {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(join(outputDir, "styles.json"), JSON.stringify({ sections: [{}, {}, {}] }));
      writeFileSync(join(outputDir, "structure.json"), JSON.stringify({ tree: [] }));
      writeFileSync(join(outputDir, "00-globals.json"), JSON.stringify({ body: {} }));
    };
    const stubImages = async ({ outputDir }: { outputDir: string }) => {
      writeFileSync(join(outputDir, "images.json"), JSON.stringify({ totalImages: 4, sections: [] }));
    };
    const stubAnimations = async ({ outputDir }: { outputDir: string }) => {
      writeFileSync(join(outputDir, "animations.json"), JSON.stringify({ sections: [{ animations: [{}, {}] }] }));
    };

    const manifest = await extractPage({
      url: "https://example.com/",
      slug: "home",
      pagesDir,
      adapterPath: "/some/adapter.json",
      runStyles: stubStyles,
      runImages: stubImages,
      runAnimations: stubAnimations,
    });

    PageSpecManifestSchema.parse(manifest);
    expect(manifest.url).toBe("https://example.com/");
    expect(manifest.slug).toBe("home");
    expect(manifest.stats.sectionCount).toBe(3);
    expect(manifest.stats.imageCount).toBe(4);
    expect(manifest.stats.animationCount).toBe(2);
    expect(existsSync(join(pagesDir, "home/spec/styles.json"))).toBe(true);
    expect(existsSync(join(pagesDir, "home/spec/images.json"))).toBe(true);
    expect(existsSync(join(pagesDir, "home/spec/animations.json"))).toBe(true);
  });

  it("captures step failures in manifest.errors instead of throwing", async () => {
    const root = mkdtempSync(join(tmpdir(), "extract-page-"));
    const pagesDir = join(root, ".migration/pages");
    mkdirSync(pagesDir, { recursive: true });

    const stubStyles = async ({ outputDir }: { outputDir: string }) => {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(join(outputDir, "styles.json"), JSON.stringify({ sections: [] }));
      writeFileSync(join(outputDir, "structure.json"), JSON.stringify({ tree: [] }));
      writeFileSync(join(outputDir, "00-globals.json"), JSON.stringify({ body: {} }));
    };
    const stubImages = async () => { throw new Error("network down"); };
    const stubAnimations = async ({ outputDir }: { outputDir: string }) => {
      writeFileSync(join(outputDir, "animations.json"), JSON.stringify({ sections: [] }));
    };

    const manifest = await extractPage({
      url: "https://example.com/",
      slug: "home",
      pagesDir,
      adapterPath: "/some/adapter.json",
      runStyles: stubStyles,
      runImages: stubImages,
      runAnimations: stubAnimations,
    });
    expect(manifest.errors.find(e => e.step === "images")?.message).toMatch(/network down/);
    expect(manifest.stats.imageCount).toBe(0);
  });
});
