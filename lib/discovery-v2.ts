import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { posix } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { CrawlSchema, type Crawl } from "../schemas/crawl.ts";
import { DiscoveredSectionsSchema, type DiscoveredSections } from "../schemas/sections.ts";
import { RawDiscoveryEvidenceSchema, type RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";
import { dismissCookieBanner, getAllCookieSkipSelectors } from "../scripts/lib/cookie-consent.ts";
import { runCrawl, type RunCrawlArgs } from "./crawl-runner.ts";
import { runDiscoverSections, type RunDiscoverSectionsArgs } from "./discover-sections-runner.ts";
import { migrationPaths } from "./migration-paths.ts";
import { runProbeBatch, type RunProbeBatchArgs } from "./probe-runner.ts";
import { urlToSlug } from "./slug.ts";

const REFERENCE_VIEWPORTS = [390, 768, 1440] as const;
const DEFAULT_SECTION_SELECTOR = "body > header, body > main > *, body > footer";

type CrawlRunner = (args: RunCrawlArgs) => Promise<void>;
type ProbeRunner = (args: RunProbeBatchArgs) => Promise<void>;
type SectionRunner = (args: RunDiscoverSectionsArgs) => Promise<void>;
type ScreenshotCapturer = (args: {
  targetDir: string;
  crawl: Crawl;
  discoveredSections: DiscoveredSections;
  primarySelector: string;
}) => Promise<RawDiscoveryEvidence["referenceScreenshots"]>;

export interface RunDiscoveryV2Args {
  targetDir: string;
  sourceUrl: string;
  maxPages?: number;
  maxDepth?: number;
  primarySelector?: string;
  initialPageSelection?: string[];
  crawlRunner?: CrawlRunner;
  probeRunner?: ProbeRunner;
  sectionRunner?: SectionRunner;
  screenshotCapturer?: ScreenshotCapturer;
  now?: () => Date;
}

export interface DiscoveryV2Result {
  rawDiscoveryPath: string;
  evidence: RawDiscoveryEvidence;
}

export async function runDiscoveryV2(args: RunDiscoveryV2Args): Promise<DiscoveryV2Result> {
  const paths = migrationPaths(args.targetDir);
  const discoveryDir = dirname(paths.rawDiscovery);
  const referencesDir = join(args.targetDir, ".migration", "references");
  mkdirSync(discoveryDir, { recursive: true });
  mkdirSync(referencesDir, { recursive: true });

  const crawlPath = join(discoveryDir, "crawl.json");
  const probePath = join(discoveryDir, "probe.json");
  const discoveredSectionsPath = join(discoveryDir, "section-discovery.json");
  const crawlRunner = args.crawlRunner ?? runCrawl;
  const probeRunner = args.probeRunner ?? runProbeBatch;
  const sectionRunner = args.sectionRunner ?? runDiscoverSections;

  await crawlRunner({
    sourceUrl: args.sourceUrl,
    outputPath: crawlPath,
    maxPages: args.maxPages,
    maxDepth: args.maxDepth,
  });

  const crawl = CrawlSchema.parse(JSON.parse(readFileSync(crawlPath, "utf8")));
  const selectedCrawl = {
    ...crawl,
    pages: selectCrawledPages(crawl, args.sourceUrl, args.initialPageSelection),
  };
  const urls = selectedCrawl.pages.map(page => page.url);

  await probeRunner({
    urls,
    outputPath: probePath,
  });

  await sectionRunner({
    urls,
    primarySelector: args.primarySelector ?? DEFAULT_SECTION_SELECTOR,
    skipSelectors: getAllCookieSkipSelectors(),
    outputPath: discoveredSectionsPath,
  });

  const discoveredSections = DiscoveredSectionsSchema.parse(
    JSON.parse(readFileSync(discoveredSectionsPath, "utf8")),
  );
  const screenshotCapturer = args.screenshotCapturer ?? captureReferenceScreenshots;
  const referenceScreenshots = await screenshotCapturer({
    targetDir: args.targetDir,
    crawl: selectedCrawl,
    discoveredSections,
    primarySelector: args.primarySelector ?? DEFAULT_SECTION_SELECTOR,
  });

  const evidence = RawDiscoveryEvidenceSchema.parse({
    probedAt: discoveredSections.probedAt,
    pages: discoveredSections.pages,
    referenceScreenshots,
    source: {
      sourceUrl: args.sourceUrl,
      capturedAt: (args.now ?? (() => new Date()))().toISOString(),
    },
  });
  writeFileSync(paths.rawDiscovery, JSON.stringify(evidence, null, 2));

  return {
    rawDiscoveryPath: paths.rawDiscovery,
    evidence,
  };
}

async function captureReferenceScreenshots(args: {
  targetDir: string;
  crawl: Crawl;
  discoveredSections: DiscoveredSections;
  primarySelector: string;
}): Promise<RawDiscoveryEvidence["referenceScreenshots"]> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const components: RawDiscoveryEvidence["referenceScreenshots"]["components"] = [];
  const pages: RawDiscoveryEvidence["referenceScreenshots"]["pages"] = [];

  try {
    for (const viewport of REFERENCE_VIEWPORTS) {
      await page.setViewportSize({ width: viewport, height: 900 });
      for (const pageSections of args.discoveredSections.pages) {
        await page.goto(pageSections.url, { waitUntil: "domcontentloaded", timeout: 15_000 });
        await dismissCookieBanner(page);

        const slug = slugForUrl(args.crawl, pageSections.url);
        const pagePath = referencePath("pages", `${slug}-${viewport}.png`);
        await page.screenshot({
          path: absoluteReferencePath(args.targetDir, pagePath),
          fullPage: true,
        });
        pages.push({
          slug,
          url: pageSections.url,
          viewport,
          path: pagePath,
          sha256: sha256File(absoluteReferencePath(args.targetDir, pagePath)),
        });

        for (const section of pageSections.sections) {
          const sectionIndex = sectionIndexFromId(section.id);
          const path = referencePath("components", `${section.id}-${viewport}.png`);
          await screenshotSection(page, args.primarySelector, sectionIndex, absoluteReferencePath(args.targetDir, path));
          components.push({
            sectionInstanceId: section.id,
            url: pageSections.url,
            viewport,
            path,
            sha256: sha256File(absoluteReferencePath(args.targetDir, path)),
          });
        }
      }
    }
  } finally {
    await browser.close();
  }

  return { components, pages };
}

function selectCrawledPages(
  crawl: Crawl,
  sourceUrl: string,
  initialPageSelection: string[] | undefined,
): Crawl["pages"] {
  if (!initialPageSelection || initialPageSelection.length === 0) {
    return crawl.pages;
  }
  const selectedUrls = new Set(
    initialPageSelection
      .map(entry => entry.trim())
      .filter(Boolean)
      .filter(entry => entry.toLowerCase() !== "all")
      .map(entry => new URL(entry, sourceUrl).href),
  );
  if (selectedUrls.size === 0) {
    return crawl.pages;
  }
  const selectedPages = crawl.pages.filter(page => selectedUrls.has(new URL(page.url).href));
  if (selectedPages.length === 0) {
    throw new Error(`No crawled pages matched initialPageSelection: ${initialPageSelection.join(", ")}`);
  }
  return selectedPages;
}

async function screenshotSection(page: Page, selector: string, sectionIndex: number, path: string): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  const section = page.locator(selector).nth(sectionIndex);
  await section.screenshot({ path });
}

function referencePath(kind: "components" | "pages", fileName: string): string {
  return posix.join("references", kind, fileName);
}

function absoluteReferencePath(targetDir: string, referencePath: string): string {
  return join(targetDir, ".migration", referencePath);
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sectionIndexFromId(sectionId: string): number {
  const match = /-s(\d+)$/.exec(sectionId);
  return match ? Number(match[1]) : 0;
}

function slugForUrl(crawl: Crawl, url: string): string {
  const normalizedUrl = new URL(url).href;
  return crawl.pages.find(page => new URL(page.url).href === normalizedUrl)?.slug ?? urlToSlug(url);
}
