import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import getPort from "get-port";
import { runDiscoveryV2 } from "../lib/discovery-v2.ts";
import { migrationPaths } from "../lib/migration-paths.ts";
import { RawDiscoveryEvidenceSchema } from "../schemas/raw-discovery.ts";

const fixtureDir = fileURLToPath(new URL("./fixtures/section-fixture/", import.meta.url));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const port = await getPort();
  server = createServer((req, res) => {
    const reqPath = (req.url ?? "/").split("?")[0];
    const file = reqPath === "/"
      ? "index.html"
      : `${reqPath.replace(/^\//, "").replace(/\/$/, "")}.html`;
    const path = join(fixtureDir, file);
    if (!existsSync(path)) {
      res.statusCode = 404;
      res.end("nope");
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(readFileSync(path, "utf8"));
  });
  await new Promise<void>(resolve => server.listen(port, resolve));
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

describe("runDiscoveryV2", () => {
  it("writes raw discovery evidence and reference screenshots without legacy phase dirs", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "discovery-v2-"));

    const result = await runDiscoveryV2({
      targetDir,
      sourceUrl: `${baseUrl}/`,
      maxPages: 1,
      maxDepth: 0,
    });

    const paths = migrationPaths(targetDir);
    expect(result.rawDiscoveryPath).toBe(paths.rawDiscovery);
    expect(existsSync(paths.rawDiscovery)).toBe(true);
    expect(existsSync(join(targetDir, ".migration/runs/001-initial/phase-1-discover"))).toBe(false);

    const evidence = RawDiscoveryEvidenceSchema.parse(JSON.parse(readFileSync(paths.rawDiscovery, "utf8")));
    const sectionCount = evidence.pages.reduce((count, page) => count + page.sections.length, 0);
    expect(sectionCount).toBeGreaterThan(0);
    expect(evidence.referenceScreenshots.components.length).toBeGreaterThanOrEqual(sectionCount);
    expect(evidence.referenceScreenshots.pages.length).toBeGreaterThan(0);

    for (const reference of evidence.referenceScreenshots.components) {
      expect(existsSync(join(targetDir, ".migration", reference.path))).toBe(true);
    }
    for (const reference of evidence.referenceScreenshots.pages) {
      expect(existsSync(join(targetDir, ".migration", reference.path))).toBe(true);
    }
  }, 60_000);

  it("filters discovered URLs by the initial page selection before probing", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "discovery-v2-"));
    let probedUrls: string[] = [];
    let sectionUrls: string[] = [];

    await runDiscoveryV2({
      targetDir,
      sourceUrl: "https://example.com/",
      initialPageSelection: ["/about"],
      crawlRunner: async ({ outputPath }) => {
        writeJson(outputPath, {
          sourceUrl: "https://example.com/",
          crawledAt: "2026-05-07T12:00:00.000Z",
          limits: { maxPages: 10, maxDepth: 2 },
          sitemapUrls: [],
          pages: [
            page("https://example.com/", "home", "seed"),
            page("https://example.com/about", "about", "link"),
            page("https://example.com/pricing", "pricing", "link"),
          ],
          errors: [],
        });
      },
      probeRunner: async ({ urls, outputPath }) => {
        probedUrls = urls;
        writeJson(outputPath, {
          probedAt: "2026-05-07T12:00:00.000Z",
          pages: urls.map(url => ({
            url,
            matchedAdapters: [],
            recommendation: "DIRECT_EXTRACTION",
            detectedCMP: null,
            isSPA: false,
          })),
        });
      },
      sectionRunner: async ({ urls, outputPath }) => {
        sectionUrls = urls;
        writeJson(outputPath, {
          probedAt: "2026-05-07T12:00:00.000Z",
          pages: urls.map(url => ({
            url,
            sections: [{
              id: "p0-s0",
              selector: "main > section",
              tagSkeleton: "section>h1",
              pathShingles: ["body>main>section"],
              sampleText: "About",
              boundingBox: { x: 0, y: 0, width: 100, height: 100 },
            }],
          })),
        });
      },
      screenshotCapturer: async () => ({
        components: [{
          sectionInstanceId: "p0-s0",
          url: "https://example.com/about",
          viewport: 390,
          path: "references/components/p0-s0-390.png",
          sha256: "0".repeat(64),
        }],
        pages: [{
          slug: "about",
          url: "https://example.com/about",
          viewport: 390,
          path: "references/pages/about-390.png",
          sha256: "1".repeat(64),
        }],
      }),
    });

    expect(probedUrls).toEqual(["https://example.com/about"]);
    expect(sectionUrls).toEqual(["https://example.com/about"]);
  });

  it("fails clearly when the initial page selection matches no crawled pages", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "discovery-v2-"));
    let probeCalled = false;

    await expect(runDiscoveryV2({
      targetDir,
      sourceUrl: "https://example.com/",
      initialPageSelection: ["/missing"],
      crawlRunner: async ({ outputPath }) => {
        writeJson(outputPath, {
          sourceUrl: "https://example.com/",
          crawledAt: "2026-05-07T12:00:00.000Z",
          limits: { maxPages: 10, maxDepth: 2 },
          sitemapUrls: [],
          pages: [
            page("https://example.com/", "home", "seed"),
            page("https://example.com/about", "about", "link"),
          ],
          errors: [],
        });
      },
      probeRunner: async () => {
        probeCalled = true;
      },
      sectionRunner: async () => {
        throw new Error("section discovery should not run");
      },
      screenshotCapturer: async () => {
        throw new Error("screenshot capture should not run");
      },
    })).rejects.toThrow(/No crawled pages matched initialPageSelection/);

    expect(probeCalled).toBe(false);
  });
});

function page(url: string, slug: string, discoveredVia: "seed" | "sitemap" | "link") {
  return {
    url,
    slug,
    title: slug,
    depth: discoveredVia === "seed" ? 0 : 1,
    discoveredVia,
    status: 200,
    outboundLinks: [],
  };
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2));
}
