import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import type { PageSpecManifest } from "../schemas/page-spec.ts";

const execFileP = promisify(execFile);

export interface ExtractStepArgs {
  url: string;
  outputDir: string;
  adapterPath: string;
  pluginRoot: string;
}

export type ExtractStep = (args: ExtractStepArgs) => Promise<void>;

export interface ExtractPageArgs {
  url: string;
  slug: string;
  /** Absolute path to <.migration>/pages */
  pagesDir: string;
  /** Absolute path to the matched adapter JSON */
  adapterPath: string;
  pluginRoot?: string;
  runStyles?: ExtractStep;
  runImages?: ExtractStep;
  runAnimations?: ExtractStep;
  viewport?: { width: number; height: number };
}

/**
 * Extract one page: invoke the three extraction scripts in sequence,
 * write their outputs to <pagesDir>/<slug>/spec/, and return a manifest.
 * Step failures are captured in `manifest.errors`; the function does NOT
 * throw on per-step failures — the caller decides whether to fail the
 * whole gate.
 */
export async function extractPage(args: ExtractPageArgs): Promise<PageSpecManifest> {
  const root = args.pluginRoot ?? defaultPluginRoot();
  const specDir = join(args.pagesDir, args.slug, "spec");
  mkdirSync(specDir, { recursive: true });

  const errors: PageSpecManifest["errors"] = [];

  const runStyles = args.runStyles ?? defaultRunStyles;
  const runImages = args.runImages ?? defaultRunImages;
  const runAnimations = args.runAnimations ?? defaultRunAnimations;

  await runOrCapture(
    "styles",
    () => runStyles({ url: args.url, outputDir: specDir, adapterPath: args.adapterPath, pluginRoot: root }),
    errors,
  );
  await runOrCapture(
    "images",
    () => runImages({ url: args.url, outputDir: specDir, adapterPath: args.adapterPath, pluginRoot: root }),
    errors,
  );
  await runOrCapture(
    "animations",
    () => runAnimations({ url: args.url, outputDir: specDir, adapterPath: args.adapterPath, pluginRoot: root }),
    errors,
  );

  const stats = readStats(specDir);
  const manifest: PageSpecManifest = {
    url: args.url,
    slug: args.slug,
    extractedAt: new Date().toISOString(),
    viewport: args.viewport ?? { width: 1440, height: 900 },
    files: {
      styles: "spec/styles.json",
      images: existsSync(join(specDir, "image-manifest.json")) ? "spec/image-manifest.json" : "spec/images.json",
      animations: "spec/animations.json",
      structure: "spec/structure.json",
      globals: "spec/00-globals.json",
    },
    stats,
    errors,
  };
  writeFileSync(join(args.pagesDir, args.slug, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

async function runOrCapture(
  step: PageSpecManifest["errors"][number]["step"],
  fn: () => Promise<void>,
  errors: PageSpecManifest["errors"],
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    errors.push({ step, message: (err as Error).message });
  }
}

function readStats(specDir: string): PageSpecManifest["stats"] {
  let sectionCount = 0;
  let imageCount = 0;
  let animationCount = 0;
  // extract-styles writes per-section sidecars `NN-<label>.styles.json`, not a
  // unified styles.json. Count sidecars when available; fall back to a unified
  // file when a stub harness produces one (test fixtures still write
  // styles.json directly).
  if (existsSync(join(specDir, "styles.json"))) {
    const styles = JSON.parse(readFileSync(join(specDir, "styles.json"), "utf8"));
    sectionCount = Array.isArray(styles?.sections) ? styles.sections.length : 0;
  } else if (existsSync(specDir)) {
    sectionCount = readdirSync(specDir).filter(f => /^\d+-.*\.styles\.json$/.test(f)).length;
  }
  const imagesPath = existsSync(join(specDir, "images.json"))
    ? join(specDir, "images.json")
    : join(specDir, "image-manifest.json");
  if (existsSync(imagesPath)) {
    const images = JSON.parse(readFileSync(imagesPath, "utf8"));
    imageCount = typeof images?.totalImages === "number" ? images.totalImages : 0;
  }
  // extract-animations also writes per-section sidecars (`NN-<label>.animations.json`).
  // Same fallback pattern — sum each section's animation count.
  if (existsSync(join(specDir, "animations.json"))) {
    const animations = JSON.parse(readFileSync(join(specDir, "animations.json"), "utf8"));
    animationCount = Array.isArray(animations?.sections)
      ? animations.sections.reduce((sum: number, s: { animations?: unknown[] }) => sum + (s.animations?.length ?? 0), 0)
      : 0;
  } else if (existsSync(specDir)) {
    for (const f of readdirSync(specDir)) {
      if (!/^\d+-.*\.animations\.json$/.test(f)) continue;
      try {
        const data = JSON.parse(readFileSync(join(specDir, f), "utf8"));
        if (Array.isArray(data?.animations)) animationCount += data.animations.length;
      } catch {
        // skip malformed sidecar
      }
    }
  }
  return { sectionCount, imageCount, animationCount };
}

// Cap per-subprocess wall-clock time. Without this, a hung extract script
// (see knowledge/open-issues/004) wedges its parent worker indefinitely.
// Override via env for tests or large-page allowances.
const SUBPROCESS_TIMEOUT_MS = Number(process.env.EXTRACT_SUBPROCESS_TIMEOUT_MS ?? 180_000);

const defaultRunStyles: ExtractStep = async ({ url, outputDir, adapterPath, pluginRoot }) => {
  const script = resolve(pluginRoot, "scripts/extract-styles.ts");
  await execFileP("npx", ["tsx", script, url, outputDir, "--adapter", adapterPath], {
    env: process.env,
    timeout: SUBPROCESS_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
};

const defaultRunImages: ExtractStep = async ({ url, outputDir, adapterPath, pluginRoot }) => {
  const script = resolve(pluginRoot, "scripts/extract-images.ts");
  // extract-images.ts hardcodes `public/images/<domain>/<page>` for binaries
  // (relative to CWD) and `docs/specs/<page>` for JSON. We invoke with cwd
  // set to a per-page staging dir, then move the JSON output into spec/.
  // Binaries stay in the staging dir; Phase 5 copies them into the user's
  // <target>/public/ during build. v1 does not move them itself.
  const stagingDir = resolve(outputDir, "..", "_staging");
  mkdirSync(stagingDir, { recursive: true });
  try {
    await execFileP("npx", ["tsx", script, url, "--page", "page", "--adapter", adapterPath], {
      env: process.env,
      cwd: stagingDir,
      timeout: SUBPROCESS_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });
  } finally {
    moveStagedImageOutputs(stagingDir, outputDir);
  }
};

export function moveStagedImageOutputs(stagingDir: string, outputDir: string): void {
  mkdirSync(outputDir, { recursive: true });
  const stagedManifest = join(stagingDir, "docs/specs/page/image-manifest.json");
  if (existsSync(stagedManifest)) renameSync(stagedManifest, join(outputDir, "image-manifest.json"));
  const stagedJson = join(stagingDir, "docs/specs/page/images.json");
  if (existsSync(stagedJson)) renameSync(stagedJson, join(outputDir, "images.json"));
}

const defaultRunAnimations: ExtractStep = async ({ url, outputDir, adapterPath, pluginRoot }) => {
  const script = resolve(pluginRoot, "scripts/extract-animations.ts");
  await execFileP("npx", ["tsx", script, url, outputDir, "--adapter", adapterPath], {
    env: process.env,
    timeout: SUBPROCESS_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
};

function defaultPluginRoot(): string {
  return resolve(fileURLToPath(new URL("..", import.meta.url)));
}
