import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import getPort from "get-port";
import { runAnalyze } from "../lib/analyze.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";
import { LayoutsSchema } from "../schemas/layouts.ts";
import { ComponentsSchema } from "../schemas/components.ts";
import { PropsRegistrySchema } from "../schemas/props.ts";
import { RoutesSchema } from "../schemas/routes.ts";

const fixtureDir = fileURLToPath(new URL("./fixtures/section-fixture/", import.meta.url));
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const port = await getPort();
  server = createServer((req, res) => {
    const reqPath = (req.url ?? "/").split("?")[0];
    let file: string;
    if (reqPath === "/") file = "index.html";
    else file = `${reqPath.replace(/^\//, "").replace(/\/$/, "")}.html`;
    const path = join(fixtureDir, file);
    if (!existsSync(path)) { res.statusCode = 404; res.end("nope"); return; }
    res.setHeader("Content-Type", "text/html");
    res.end(readFileSync(path, "utf8"));
  });
  await new Promise<void>(r => server.listen(port, r));
  baseUrl = `http://127.0.0.1:${port}`;
});
afterAll(() => new Promise<void>(r => server.close(() => r())));

const baseSite = (sourceUrl: string) => ({
  sourceUrl, target: "./",
  mode: "unattended" as const, goal: "wireframe" as const, inputMode: "url-only" as const,
  maxParallelPages: 4, maxParallelSections: 4,
});

function writePhase1Artifacts(targetDir: string, runDir: string, urls: string[]) {
  const phaseDir = join(targetDir, ".migration/runs", runDir, "phase-1-discover");
  const discoveryDir = join(phaseDir, "discovery");
  mkdirSync(discoveryDir, { recursive: true });
  const crawl = {
    sourceUrl: urls[0],
    crawledAt: new Date().toISOString(),
    limits: { maxPages: 10, maxDepth: 2 },
    robotsTxt: { fetched: true, disallowedPaths: [] },
    sitemapUrls: [],
    pages: urls.map((u, i) => ({
      url: u,
      slug: i === 0 ? "home" : new URL(u).pathname.replace(/^\//, "").replace(/\//g, "-"),
      title: u,
      depth: i === 0 ? 0 : 1,
      discoveredVia: i === 0 ? "seed" : "link",
      status: 200,
      outboundLinks: [],
    })),
    errors: [],
  };
  writeFileSync(join(discoveryDir, "crawl.json"), JSON.stringify(crawl, null, 2));
  writeFileSync(join(phaseDir, "VERIFICATION.md"), "# verified");
}

describe("runAnalyze", () => {
  it("writes layouts/components/props/routes.json + HISTORY.md and emits VERIFICATION.md", async () => {
    const root = mkdtempSync(join(tmpdir(), "analyze-"));
    await bootstrapMigration({ targetDir: root, site: baseSite(baseUrl + "/") });
    const urls = [baseUrl + "/", baseUrl + "/about", baseUrl + "/pricing", baseUrl + "/case-study-x"];
    writePhase1Artifacts(root, "001-initial", urls);

    await runAnalyze({
      targetDir: root,
      runDir: "001-initial",
      primarySelector: "body > header, body > main > *, body > footer",
    });

    const phaseDir = join(root, ".migration/runs/001-initial/phase-2-analyze");
    expect(existsSync(join(phaseDir, "PLAN.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "EXECUTION.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "analysis/sections.json"))).toBe(true);
    expect(existsSync(join(phaseDir, "analysis/clusters.json"))).toBe(true);

    const libDir = join(root, ".migration/library");
    LayoutsSchema.parse(JSON.parse(readFileSync(join(libDir, "layouts.json"), "utf8")));
    ComponentsSchema.parse(JSON.parse(readFileSync(join(libDir, "components.json"), "utf8")));
    PropsRegistrySchema.parse(JSON.parse(readFileSync(join(libDir, "props.json"), "utf8")));
    const routes = RoutesSchema.parse(JSON.parse(readFileSync(join(libDir, "routes.json"), "utf8")));
    // Every URL in crawl.json appears in routes.json
    expect(new Set(routes.routes.map(r => r.sourceUrl))).toEqual(new Set(urls));
    expect(existsSync(join(libDir, "HISTORY.md"))).toBe(true);
  }, 60_000);

  it("does NOT emit VERIFICATION.md when crawl.json is missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "analyze-"));
    await bootstrapMigration({ targetDir: root, site: baseSite(baseUrl + "/") });
    // Note: NO Phase 1 artifacts written.
    await runAnalyze({
      targetDir: root,
      runDir: "001-initial",
      primarySelector: "body > header, body > main > *, body > footer",
    });
    const phaseDir = join(root, ".migration/runs/001-initial/phase-2-analyze");
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(false);
    const v = JSON.parse(readFileSync(join(phaseDir, "verification.json"), "utf8"));
    expect(v.passed).toBe(false);
    expect(v.criteria.find((c: { name: string }) => c.name.includes("crawl"))?.passed).toBe(false);
  }, 60_000);

  it("uses the supplied discoverSections stub instead of the real subprocess", async () => {
    const root = mkdtempSync(join(tmpdir(), "analyze-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    const urls = ["https://example.com/", "https://example.com/about"];
    writePhase1Artifacts(root, "001-initial", urls);

    let invoked = 0;
    const stubSections = async ({ urls: u, outputPath }: { urls: string[]; outputPath: string }) => {
      invoked++;
      const data = {
        probedAt: new Date().toISOString(),
        pages: u.map(url => ({
          url,
          sections: [
            {
              id: `${url}-s0`,
              selector: "body > header",
              tagSkeleton: "header>nav",
              pathShingles: ["body>header", "header>nav"],
              sampleText: "header",
              boundingBox: { x: 0, y: 0, width: 1440, height: 80 },
            },
          ],
        })),
      };
      mkdirSync(join(outputPath, ".."), { recursive: true });
      writeFileSync(outputPath, JSON.stringify(data, null, 2));
    };

    await runAnalyze({
      targetDir: root,
      runDir: "001-initial",
      primarySelector: "body > header",
      discoverSections: stubSections,
    });
    expect(invoked).toBe(1);
    const phaseDir = join(root, ".migration/runs/001-initial/phase-2-analyze");
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(true);
  });

  it("filters non-visual clusters (script/noscript/style/link/meta) from components.json", async () => {
    const root = mkdtempSync(join(tmpdir(), "analyze-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    const urls = ["https://example.com/", "https://example.com/about"];
    writePhase1Artifacts(root, "001-initial", urls);

    const stubSections = async ({ urls: u, outputPath }: { urls: string[]; outputPath: string }) => {
      const mk = (id: string, tagSkeleton: string, sampleText: string) => ({
        id, selector: "body > *", tagSkeleton,
        pathShingles: [tagSkeleton], sampleText,
        boundingBox: { x: 0, y: 0, width: 1440, height: 80 },
      });
      const data = {
        probedAt: new Date().toISOString(),
        pages: u.map((url, i) => ({
          url,
          sections: [
            mk(`p${i}-s0`, "section>div>h1", "real visual content"),
            mk(`p${i}-s1`, "script", "window.dataLayer = [];"),
            mk(`p${i}-s2`, "noscript", "<iframe src=gtm/></iframe>"),
            mk(`p${i}-s3`, "style", "body { margin: 0 }"),
          ],
        })),
      };
      mkdirSync(join(outputPath, ".."), { recursive: true });
      writeFileSync(outputPath, JSON.stringify(data, null, 2));
    };

    await runAnalyze({
      targetDir: root,
      runDir: "001-initial",
      primarySelector: "body > *",
      discoverSections: stubSections,
    });

    const components = JSON.parse(readFileSync(join(root, ".migration/library/components.json"), "utf8")).components;
    const skeletons = components.map((c: { tagSkeleton: string }) => c.tagSkeleton);
    expect(skeletons).toContain("section>div>h1");
    expect(skeletons.find((s: string) => /^script\b/.test(s))).toBeUndefined();
    expect(skeletons.find((s: string) => /^noscript\b/.test(s))).toBeUndefined();
    expect(skeletons.find((s: string) => /^style\b/.test(s))).toBeUndefined();
  });
});
