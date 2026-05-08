import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { posix } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { CrawlSchema, type Crawl } from "../schemas/crawl.ts";
import { DiscoveredSectionsSchema, type DiscoveredSections } from "../schemas/sections.ts";
import { RawDiscoveryEvidenceSchema, type RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";
import { dismissCookieBanner, getAllCookieSkipSelectors } from "../scripts/lib/cookie-consent.ts";
import { freezeDynamicContent } from "../scripts/lib/freeze.ts";
import { installNameShim } from "../scripts/lib/playwright-eval-shim.ts";
import { BrowserWorkQueue, type BrowserWorkQueueLike } from "./browser-work-queue.ts";
import { runCrawl, type RunCrawlArgs } from "./crawl-runner.ts";
import { runDiscoverSections, type RunDiscoverSectionsArgs } from "./discover-sections-runner.ts";
import { migrationPaths } from "./migration-paths.ts";
import { runProbeBatch, type RunProbeBatchArgs } from "./probe-runner.ts";
import { cropReferenceScreenshotFallback } from "./reference-screenshot-fallback.ts";
import { appendSessionLog } from "./session-log.ts";
import { urlToSlug } from "./slug.ts";

const REFERENCE_VIEWPORTS = [390, 768, 1440] as const;
// Inclusive top-level section selector. Many sites (e.g., Webflow exports) put
// `<section>` / `<article>` / `<aside>` directly under `<body>` without a
// `<main>` wrapper; the original `body > main > *` rule silently dropped all
// content sections on those sites and yielded only header + footer matches.
const DEFAULT_SECTION_SELECTOR =
  "body > header, body > nav, body > main > *, body > section, body > article, body > aside, body > footer";

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
  browserQueue?: BrowserWorkQueueLike;
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

  appendSessionLog({
    targetDir: args.targetDir,
    title: "discovery: crawl start",
    body: `sourceUrl: ${args.sourceUrl}\nmaxPages: ${args.maxPages ?? "default"}\nmaxDepth: ${args.maxDepth ?? "default"}`,
  });
  try {
    await crawlRunner({
      sourceUrl: args.sourceUrl,
      outputPath: crawlPath,
      maxPages: args.maxPages,
      maxDepth: args.maxDepth,
    });
  } catch (error) {
    appendSessionLog({
      targetDir: args.targetDir,
      title: "discovery: crawl error",
      body: errorToBody(error),
    });
    throw error;
  }

  const crawl = CrawlSchema.parse(JSON.parse(readFileSync(crawlPath, "utf8")));
  // Use the post-redirect canonical sourceUrl from crawl.json (e.g.
  // `https://www.example.com/`) when resolving `initialPageSelection` paths,
  // otherwise the user's apex input would never match the www-prefixed URLs
  // the crawler actually visited.
  const selectedCrawl = {
    ...crawl,
    pages: selectCrawledPages(crawl, crawl.sourceUrl, args.initialPageSelection),
  };
  const urls = selectedCrawl.pages.map(page => page.url);
  appendSessionLog({
    targetDir: args.targetDir,
    title: "discovery: crawl done",
    body: `requestedSourceUrl: ${crawl.requestedSourceUrl ?? args.sourceUrl}\ncanonicalSourceUrl: ${crawl.sourceUrl}\ncrawledPages: ${crawl.pages.length}\nselectedPages: ${selectedCrawl.pages.length}\nselection: ${args.initialPageSelection?.join(", ") ?? "(all)"}\nurls:\n${urls.map(u => `- ${u}`).join("\n")}`,
  });

  appendSessionLog({
    targetDir: args.targetDir,
    title: "discovery: probe start",
    body: `urls: ${urls.length}`,
  });
  try {
    await probeRunner({
      urls,
      outputPath: probePath,
    });
  } catch (error) {
    appendSessionLog({
      targetDir: args.targetDir,
      title: "discovery: probe error",
      body: errorToBody(error),
    });
    throw error;
  }
  appendSessionLog({
    targetDir: args.targetDir,
    title: "discovery: probe done",
    body: `output: ${probePath}`,
  });

  appendSessionLog({
    targetDir: args.targetDir,
    title: "discovery: sections start",
    body: `primarySelector: ${args.primarySelector ?? DEFAULT_SECTION_SELECTOR}`,
  });
  try {
    await sectionRunner({
      urls,
      primarySelector: args.primarySelector ?? DEFAULT_SECTION_SELECTOR,
      skipSelectors: getAllCookieSkipSelectors(),
      outputPath: discoveredSectionsPath,
    });
  } catch (error) {
    appendSessionLog({
      targetDir: args.targetDir,
      title: "discovery: sections error",
      body: errorToBody(error),
    });
    throw error;
  }
  appendSessionLog({
    targetDir: args.targetDir,
    title: "discovery: sections done",
    body: `output: ${discoveredSectionsPath}`,
  });

  const discoveredSections = DiscoveredSectionsSchema.parse(
    JSON.parse(readFileSync(discoveredSectionsPath, "utf8")),
  );
  const screenshotCapturer = args.screenshotCapturer ?? captureReferenceScreenshots;
  const browserQueue = args.browserQueue ?? BrowserWorkQueue.from({ targetDir: args.targetDir });
  appendSessionLog({
    targetDir: args.targetDir,
    title: "discovery: reference screenshots start",
    body: `viewports: ${REFERENCE_VIEWPORTS.join(", ")}\npages: ${discoveredSections.pages.length}\nsections: ${discoveredSections.pages.reduce((acc, p) => acc + p.sections.length, 0)}`,
  });
  let referenceScreenshots: RawDiscoveryEvidence["referenceScreenshots"];
  try {
    referenceScreenshots = await browserQueue.enqueue(() =>
      screenshotCapturer({
        targetDir: args.targetDir,
        crawl: selectedCrawl,
        discoveredSections,
        primarySelector: args.primarySelector ?? DEFAULT_SECTION_SELECTOR,
      })
    );
  } catch (error) {
    appendSessionLog({
      targetDir: args.targetDir,
      title: "discovery: reference screenshots error",
      body: errorToBody(error),
    });
    throw error;
  }
  appendSessionLog({
    targetDir: args.targetDir,
    title: "discovery: reference screenshots done",
    body: `pageShots: ${referenceScreenshots.pages.length}\ncomponentShots: ${referenceScreenshots.components.length}`,
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
  appendSessionLog({
    targetDir: args.targetDir,
    title: "discovery: complete",
    body: `evidencePath: ${paths.rawDiscovery}`,
  });

  return {
    rawDiscoveryPath: paths.rawDiscovery,
    evidence,
  };
}

function errorToBody(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}${error.stack ? `\n\n\`\`\`\n${error.stack}\n\`\`\`` : ""}`;
  }
  return String(error);
}

async function captureReferenceScreenshots(args: {
  targetDir: string;
  crawl: Crawl;
  discoveredSections: DiscoveredSections;
  primarySelector: string;
}): Promise<RawDiscoveryEvidence["referenceScreenshots"]> {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await installNameShim(context);
  const page = await context.newPage();
  const components: RawDiscoveryEvidence["referenceScreenshots"]["components"] = [];
  const pages: RawDiscoveryEvidence["referenceScreenshots"]["pages"] = [];

  try {
    for (const viewport of REFERENCE_VIEWPORTS) {
      await page.setViewportSize({ width: viewport, height: 900 });
      for (const pageSections of args.discoveredSections.pages) {
        await page.goto(pageSections.url, { waitUntil: "domcontentloaded", timeout: 15_000 });
        await dismissCookieBanner(page);
        await freezeDynamicContent(page, { extractionSafe: true });

        const slug = slugForUrl(args.crawl, pageSections.url);
        const pagePath = referencePath("pages", `${slug}-${viewport}.png`);
        const absolutePagePath = absoluteReferencePath(args.targetDir, pagePath);
        await page.screenshot({
          path: absolutePagePath,
          fullPage: true,
        });
        pages.push({
          slug,
          url: pageSections.url,
          viewport,
          path: pagePath,
          sha256: sha256File(absolutePagePath),
        });

        for (const section of pageSections.sections) {
          const sectionIndex = sectionIndexFromId(section.id);
          const path = referencePath("components", `${section.id}-${viewport}.png`);
          const absoluteComponentPath = absoluteReferencePath(args.targetDir, path);
          const sectionSelector = section.selector || args.primarySelector;
          if (shouldPreferFullPageSectionCrop(section)) {
            try {
              const boundingBox = await currentSectionBoundingBox(page, sectionSelector, sectionIndex, section.boundingBox);
              cropReferenceScreenshotFallback({
                fullPagePath: absolutePagePath,
                outputPath: absoluteComponentPath,
                boundingBox,
              });
              components.push({
                sectionInstanceId: section.id,
                url: pageSections.url,
                viewport,
                path,
                sha256: sha256File(absoluteComponentPath),
              });
              continue;
            } catch {
              // Fall through to direct element screenshot. It may still work on
              // pages without sticky/fixed top overlays.
            }
          }
          try {
            await screenshotSection(page, sectionSelector, sectionIndex, absoluteComponentPath);
            components.push({
              sectionInstanceId: section.id,
              url: pageSections.url,
              viewport,
              path,
              sha256: sha256File(absoluteComponentPath),
            });
          } catch (error) {
            try {
              const boundingBox = await currentSectionBoundingBox(page, sectionSelector, sectionIndex, section.boundingBox);
              cropReferenceScreenshotFallback({
                fullPagePath: absolutePagePath,
                outputPath: absoluteComponentPath,
                boundingBox,
              });
              components.push({
                sectionInstanceId: section.id,
                url: pageSections.url,
                viewport,
                path,
                sha256: sha256File(absoluteComponentPath),
              });
              appendSessionLog({
                targetDir: args.targetDir,
                title: "discovery: section screenshot fallback",
                body: `sectionInstanceId: ${section.id}\nurl: ${pageSections.url}\nviewport: ${viewport}\nreason: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
              });
            } catch (fallbackError) {
              // If both element screenshot and full-page crop fail, keep the
              // run moving and leave the structural evidence in place.
              appendSessionLog({
                targetDir: args.targetDir,
                title: "discovery: section screenshot skipped",
                body: `sectionInstanceId: ${section.id}\nurl: ${pageSections.url}\nviewport: ${viewport}\nreason: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}\nfallbackReason: ${fallbackError instanceof Error ? fallbackError.message.split("\n")[0] : String(fallbackError)}`,
              });
            }
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  return { components, pages };
}

export function shouldPreferFullPageSectionCrop(section: Pick<
  DiscoveredSections["pages"][number]["sections"][number],
  "tagSkeleton" | "boundingBox"
>): boolean {
  if (section.boundingBox.y <= 0) return false;
  return !/^(header|nav)\b/i.test(section.tagSkeleton);
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
  // 5s timeout (down from Playwright's default 30s) so a hidden / 0-sized /
  // animated-out section fails fast instead of stalling the whole run.
  // `animations: "disabled"` makes the stable-wait succeed on sections with
  // running CSS animations; `caret: "hide"` keeps screenshots deterministic.
  await section.screenshot({ path, timeout: 5_000, animations: "disabled", caret: "hide" });
}

async function currentSectionBoundingBox(
  page: Page,
  selector: string,
  sectionIndex: number,
  fallback: DiscoveredSections["pages"][number]["sections"][number]["boundingBox"],
): Promise<DiscoveredSections["pages"][number]["sections"][number]["boundingBox"]> {
  return page.locator(selector).nth(sectionIndex).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x + window.scrollX,
      y: rect.y + window.scrollY,
      width: rect.width,
      height: rect.height,
    };
  }).catch(() => fallback);
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
