import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ProbeSchema } from "../schemas/probe.ts";
import { RawDiscoveryEvidenceSchema, type RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";
import type { PageSpecManifest } from "../schemas/page-spec.ts";
import { extractPage as defaultExtractPage } from "./extract-runner.ts";
import { enrichGeneratedIndex } from "./generated-index-enricher.ts";
import { runJsxGeneration as defaultRunJsxGeneration } from "./jsx-generator-runner.ts";
import { writeDesignSystemFoundation } from "./design-system-foundation.ts";
import { migrationPaths } from "./migration-paths.ts";
import { urlToSlug } from "./slug.ts";

export interface GuidedExtractionEntry {
  url: string;
  slug: string;
  status: "generated" | "skipped" | "failed";
  adapterPath: string | null;
  manifestPath: string;
  generatedDir: string;
  error: string | null;
}

export interface GuidedExtractionReport {
  kind: "guided-extraction-report";
  artifactVersion: string;
  generatedAt: string;
  reportPath: string;
  entries: GuidedExtractionEntry[];
}

export interface EnsureGuidedExtractionReadyArgs {
  targetDir: string;
  artifactVersion: string;
  pluginRoot?: string;
  now?: () => string;
  extractPage?: (args: {
    url: string;
    slug: string;
    pagesDir: string;
    adapterPath: string;
    pluginRoot?: string;
  }) => Promise<PageSpecManifest>;
  runJsxGeneration?: (args: {
    specsDir: string;
    outputDir: string;
    pluginRoot: string;
  }) => Promise<unknown>;
}

export async function ensureGuidedExtractionReady(
  args: EnsureGuidedExtractionReadyArgs,
): Promise<GuidedExtractionReport> {
  const paths = migrationPaths(args.targetDir);
  const rawDiscovery = RawDiscoveryEvidenceSchema.parse(
    JSON.parse(readFileSync(paths.rawDiscovery, "utf8")),
  );
  const probe = ProbeSchema.parse(
    JSON.parse(readFileSync(join(args.targetDir, ".migration/discovery/probe.json"), "utf8")),
  );
  const pluginRoot = args.pluginRoot ?? defaultPluginRoot();
  const pagesDir = join(args.targetDir, ".migration/pages");
  const reportPath = join(
    args.targetDir,
    ".migration/reports/guided-extraction",
    `${args.artifactVersion}.json`,
  );
  const entries: GuidedExtractionEntry[] = [];

  for (const [pageIndex, page] of rawDiscovery.pages.entries()) {
    const slug = slugForPage(rawDiscovery, page.url);
    const manifestPath = join(pagesDir, slug, "manifest.json");
    const generatedDir = join(pagesDir, slug, "generated");
    const adapterPath = probe.pages.find(probedPage => probedPage.url === page.url)?.matchedAdapters[0] ?? null;

    if (isPageExtractionReady({ pagesDir, slug })) {
      entries.push({
        url: page.url,
        slug,
        status: "skipped",
        adapterPath,
        manifestPath,
        generatedDir,
        error: null,
      });
      continue;
    }

    if (!adapterPath) {
      entries.push({
        url: page.url,
        slug,
        status: "failed",
        adapterPath,
        manifestPath,
        generatedDir,
        error: "No matched adapter path found in discovery probe output",
      });
      continue;
    }

    try {
      const manifest = await (args.extractPage ?? defaultExtractPage)({
        url: page.url,
        slug,
        pagesDir,
        adapterPath,
        pluginRoot,
      });
      writeJson(manifestPath, manifest);
      writeDesignSystemFoundation({
        targetDir: args.targetDir,
        globalsPath: join(pagesDir, slug, "spec/00-globals.json"),
      });
      await (args.runJsxGeneration ?? defaultRunJsxGeneration)({
        specsDir: join(pagesDir, slug, "spec"),
        outputDir: generatedDir,
        pluginRoot,
      });
      // Upgrade `generated/index.json` stub entries to their corresponding
      // `.generated.jsx` files when extract-styles' spec manifest gives us
      // a confident match. See docs/issues/003.
      try {
        enrichGeneratedIndex({
          generatedDir,
          specsDir: join(pagesDir, slug, "spec"),
          pageSections: page.sections,
          pageIndex,
        });
      } catch {
        // Enrichment is opportunistic; failure leaves the stub mapping in
        // place so the implementer can still resolve sources.
      }
      entries.push({
        url: page.url,
        slug,
        status: "generated",
        adapterPath,
        manifestPath,
        generatedDir,
        error: null,
      });
    } catch (error) {
      entries.push({
        url: page.url,
        slug,
        status: "failed",
        adapterPath,
        manifestPath,
        generatedDir,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const report: GuidedExtractionReport = {
    kind: "guided-extraction-report",
    artifactVersion: args.artifactVersion,
    generatedAt: (args.now ?? (() => new Date().toISOString()))(),
    reportPath,
    entries,
  };
  writeJson(reportPath, report);

  const failure = entries.find(entry => entry.status === "failed");
  if (failure) {
    throw new Error(`Guided extraction failed for ${failure.slug}: ${failure.error}`);
  }

  return report;
}

function isPageExtractionReady(args: { pagesDir: string; slug: string }): boolean {
  const pageDir = join(args.pagesDir, args.slug);
  const generatedDir = join(pageDir, "generated");
  return existsSync(join(pageDir, "manifest.json")) &&
    existsSync(join(pageDir, "spec/00-globals.json")) &&
    existsSync(generatedDir) &&
    readdirSync(generatedDir).some(file => file.endsWith(".tsx") || file.endsWith(".generated.jsx"));
}

function slugForPage(rawDiscovery: RawDiscoveryEvidence, url: string): string {
  return rawDiscovery.referenceScreenshots.pages.find(reference => reference.url === url)?.slug ?? urlToSlug(url);
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function defaultPluginRoot(): string {
  return resolve(fileURLToPath(new URL("..", import.meta.url)));
}
