import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "node:http";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import getPort from "get-port";
import { runDiscover } from "../lib/discover.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";
import { CrawlSchema } from "../schemas/crawl.ts";
import { ProbeSchema } from "../schemas/probe.ts";

const fixtureDir = fileURLToPath(new URL("./fixtures/site-fixture/", import.meta.url));
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const port = await getPort();
  server = createServer((req, res) => {
    const reqPath = (req.url ?? "/").split("?")[0];
    let file: string;
    if (reqPath === "/") file = "index.html";
    else if (reqPath === "/robots.txt") file = "robots.txt";
    else file = `${reqPath.replace(/^\//, "").replace(/\/$/, "")}.html`;
    const path = join(fixtureDir, file);
    if (!existsSync(path)) { res.statusCode = 404; res.end("nope"); return; }
    res.setHeader("Content-Type", file.endsWith(".html") ? "text/html" : "text/plain");
    res.end(readFileSync(path, "utf8"));
  });
  await new Promise<void>(r => server.listen(port, r));
  baseUrl = `http://127.0.0.1:${port}`;
});
afterAll(() => new Promise<void>(r => server.close(() => r())));

const baseSite = (sourceUrl: string) => ({
  sourceUrl, target: "./",
  inputMode: "url-only" as const,
  maxParallelPages: 4, maxParallelSections: 4,
});

describe("runDiscover", () => {
  it("writes crawl.json + probe.json + VERIFICATION.md when every page has a matched adapter", async () => {
    const root = mkdtempSync(join(tmpdir(), "discover-"));
    await bootstrapMigration({ targetDir: root, site: baseSite(baseUrl + "/") });
    const allMatched = async (url: string) => ({
      url, matchedAdapters: ["static-html"], recommendation: "DIRECT_EXTRACTION",
      detectedCMP: null, spaAnalysis: { isSPA: false },
    });
    await runDiscover({
      targetDir: root,
      runDir: "001-initial",
      probeOne: allMatched,
      confirmPageList: true,
    });
    const phaseDir = join(root, ".migration/runs/001-initial/phase-1-discover");
    expect(existsSync(join(phaseDir, "discovery/crawl.json"))).toBe(true);
    expect(existsSync(join(phaseDir, "discovery/probe.json"))).toBe(true);
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "PLAN.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "EXECUTION.md"))).toBe(true);
    CrawlSchema.parse(JSON.parse(readFileSync(join(phaseDir, "discovery/crawl.json"), "utf8")));
    ProbeSchema.parse(JSON.parse(readFileSync(join(phaseDir, "discovery/probe.json"), "utf8")));
  }, 60_000);

  it("does NOT emit VERIFICATION.md when any page is ABORT_NO_ADAPTER without explicit user opt-in", async () => {
    const root = mkdtempSync(join(tmpdir(), "discover-"));
    await bootstrapMigration({ targetDir: root, site: baseSite(baseUrl + "/") });
    const someAbort = async (url: string) => {
      if (url.endsWith("/about")) {
        return { url, matchedAdapters: [], recommendation: "ABORT_NO_ADAPTER",
                 detectedCMP: null, spaAnalysis: { isSPA: false } };
      }
      return { url, matchedAdapters: ["static-html"], recommendation: "DIRECT_EXTRACTION",
               detectedCMP: null, spaAnalysis: { isSPA: false } };
    };
    await runDiscover({
      targetDir: root,
      runDir: "001-initial",
      probeOne: someAbort,
      confirmAborts: false,
    });
    const phaseDir = join(root, ".migration/runs/001-initial/phase-1-discover");
    expect(existsSync(join(phaseDir, "discovery/crawl.json"))).toBe(true);
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(false);
    const json = JSON.parse(readFileSync(join(phaseDir, "verification.json"), "utf8"));
    expect(json.passed).toBe(false);
    expect(json.criteria.find((c: { name: string }) => c.name.includes("adapter")).passed).toBe(false);
  }, 60_000);

  it("emits VERIFICATION.md when ABORT pages are explicitly confirmed by the user", async () => {
    const root = mkdtempSync(join(tmpdir(), "discover-"));
    await bootstrapMigration({ targetDir: root, site: baseSite(baseUrl + "/") });
    const someAbort = async (url: string) => ({
      url,
      matchedAdapters: url.endsWith("/about") ? [] : ["static-html"],
      recommendation: url.endsWith("/about") ? "ABORT_NO_ADAPTER" : "DIRECT_EXTRACTION",
      detectedCMP: null,
      spaAnalysis: { isSPA: false },
    });
    await runDiscover({
      targetDir: root,
      runDir: "001-initial",
      probeOne: someAbort,
      confirmAborts: true,
      confirmPageList: true,
    });
    const phaseDir = join(root, ".migration/runs/001-initial/phase-1-discover");
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(true);
  }, 60_000);

  it("emits VERIFICATION.md without a separate page-list confirmation in the guided flow", async () => {
    const root = mkdtempSync(join(tmpdir(), "discover-"));
    await bootstrapMigration({ targetDir: root, site: baseSite(baseUrl + "/") });
    const matched = async (url: string) => ({
      url, matchedAdapters: ["static-html"], recommendation: "DIRECT_EXTRACTION",
      detectedCMP: null, spaAnalysis: { isSPA: false },
    });
    await runDiscover({
      targetDir: root, runDir: "001-initial",
      probeOne: matched, confirmPageList: false,
    });
    const phaseDir = join(root, ".migration/runs/001-initial/phase-1-discover");
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(true);
    const v = JSON.parse(readFileSync(join(phaseDir, "verification.json"), "utf8"));
    expect(v.criteria.find((c: { name: string }) => c.name.includes("page list"))).toBeUndefined();
  }, 60_000);

  it("filters crawl.json to includeUrls subset and reuses crawl when reuseCrawl is set", async () => {
    const root = mkdtempSync(join(tmpdir(), "discover-"));
    await bootstrapMigration({ targetDir: root, site: baseSite(baseUrl + "/") });
    const matched = async (url: string) => ({
      url, matchedAdapters: ["static-html"], recommendation: "DIRECT_EXTRACTION",
      detectedCMP: null, spaAnalysis: { isSPA: false },
    });
    // First pass: full crawl, no filter.
    await runDiscover({
      targetDir: root, runDir: "001-initial",
      probeOne: matched, confirmPageList: true,
    });
    const crawlPath = join(root, ".migration/runs/001-initial/phase-1-discover/discovery/crawl.json");
    const fullPages = JSON.parse(readFileSync(crawlPath, "utf8")).pages;
    expect(fullPages.length).toBeGreaterThan(1);

    // Second pass: reuse crawl + include only the seed URL.
    const seedUrl = fullPages[0].url;
    await runDiscover({
      targetDir: root, runDir: "001-initial",
      probeOne: matched, confirmPageList: true,
      reuseCrawl: true, includeUrls: [seedUrl],
    });
    const filtered = JSON.parse(readFileSync(crawlPath, "utf8")).pages;
    expect(filtered).toHaveLength(1);
    expect(filtered[0].url).toBe(seedUrl);
    const probePath = join(root, ".migration/runs/001-initial/phase-1-discover/discovery/probe.json");
    const probePages = JSON.parse(readFileSync(probePath, "utf8")).pages;
    expect(probePages).toHaveLength(1);
    expect(probePages[0].url).toBe(seedUrl);
  }, 60_000);

  it("honors initial page selection from SITE.md during phase-1 discover", async () => {
    const root = mkdtempSync(join(tmpdir(), "discover-"));
    await bootstrapMigration({
      targetDir: root,
      site: { ...baseSite(baseUrl + "/"), initialPageSelection: ["/about"] } as ReturnType<typeof baseSite> & { initialPageSelection: string[] },
    });
    const matched = async (url: string) => ({
      url, matchedAdapters: ["static-html"], recommendation: "DIRECT_EXTRACTION",
      detectedCMP: null, spaAnalysis: { isSPA: false },
    });

    await runDiscover({
      targetDir: root,
      runDir: "001-initial",
      probeOne: matched,
      confirmPageList: true,
    });

    const phaseDir = join(root, ".migration/runs/001-initial/phase-1-discover");
    const crawlPages = JSON.parse(readFileSync(join(phaseDir, "discovery/crawl.json"), "utf8")).pages;
    expect(crawlPages.map((p: { url: string }) => p.url)).toEqual([`${baseUrl}/about`]);

    const probePages = JSON.parse(readFileSync(join(phaseDir, "discovery/probe.json"), "utf8")).pages;
    expect(probePages.map((p: { url: string }) => p.url)).toEqual([`${baseUrl}/about`]);
  }, 60_000);

  it("overrides SPA_FLOW_EXTRACTION → DIRECT_EXTRACTION when isSPA is false (issue 001)", async () => {
    const root = mkdtempSync(join(tmpdir(), "discover-"));
    await bootstrapMigration({ targetDir: root, site: baseSite(baseUrl + "/") });
    const spaFalsePositive = async (url: string) => ({
      url, matchedAdapters: ["webflow"], recommendation: "SPA_FLOW_EXTRACTION",
      detectedCMP: null, spaAnalysis: { isSPA: false },
    });
    await runDiscover({
      targetDir: root, runDir: "001-initial",
      probeOne: spaFalsePositive, confirmPageList: true,
    });
    const probe = JSON.parse(readFileSync(join(root, ".migration/runs/001-initial/phase-1-discover/discovery/probe.json"), "utf8"));
    for (const p of probe.pages) {
      expect(p.recommendation).toBe("DIRECT_EXTRACTION");
      expect(p.isSPA).toBe(false);
    }
  }, 60_000);

  it("preserves SPA_FLOW_EXTRACTION when isSPA is true (real SPA)", async () => {
    const root = mkdtempSync(join(tmpdir(), "discover-"));
    await bootstrapMigration({ targetDir: root, site: baseSite(baseUrl + "/") });
    const realSpa = async (url: string) => ({
      url, matchedAdapters: ["react"], recommendation: "SPA_FLOW_EXTRACTION",
      detectedCMP: null, spaAnalysis: { isSPA: true },
    });
    await runDiscover({
      targetDir: root, runDir: "001-initial",
      probeOne: realSpa, confirmPageList: true,
    });
    const probe = JSON.parse(readFileSync(join(root, ".migration/runs/001-initial/phase-1-discover/discovery/probe.json"), "utf8"));
    for (const p of probe.pages) {
      expect(p.recommendation).toBe("SPA_FLOW_EXTRACTION");
      expect(p.isSPA).toBe(true);
    }
  }, 60_000);

  it("fails the gate when includeUrls matches zero pages", async () => {
    const root = mkdtempSync(join(tmpdir(), "discover-"));
    await bootstrapMigration({ targetDir: root, site: baseSite(baseUrl + "/") });
    const matched = async (url: string) => ({
      url, matchedAdapters: ["static-html"], recommendation: "DIRECT_EXTRACTION",
      detectedCMP: null, spaAnalysis: { isSPA: false },
    });
    await runDiscover({
      targetDir: root, runDir: "001-initial",
      probeOne: matched, confirmPageList: true,
    });
    await runDiscover({
      targetDir: root, runDir: "001-initial",
      probeOne: matched, confirmPageList: true,
      reuseCrawl: true, includeUrls: ["https://nope.example.com/"],
    });
    const v = JSON.parse(readFileSync(join(root, ".migration/runs/001-initial/phase-1-discover/verification.json"), "utf8"));
    expect(v.passed).toBe(false);
    expect(v.criteria[0].name).toContain("URL set is non-empty");
  }, 60_000);
});
