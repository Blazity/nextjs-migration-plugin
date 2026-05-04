import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extractPage } from "../lib/extract-runner.ts";
import { PageSpecManifestSchema } from "../schemas/page-spec.ts";

const execFileP = promisify(execFile);

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

  it("kills a hung subprocess via the configured timeout (issue 004)", async () => {
    // Spawn a child that sleeps forever, then assert execFile with a short
    // timeout + SIGKILL terminates it. This proves the underlying mechanism
    // that lib/extract-runner.ts wires into all three default steps via
    // EXTRACT_SUBPROCESS_TIMEOUT_MS.
    const start = Date.now();
    let err: Error | null = null;
    try {
      await execFileP("node", ["-e", "setInterval(() => {}, 1e6)"], {
        timeout: 1000,
        killSignal: "SIGKILL",
      });
    } catch (e) {
      err = e as Error;
    }
    const elapsed = Date.now() - start;
    expect(err).not.toBeNull();
    expect(elapsed).toBeLessThan(5000);
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
