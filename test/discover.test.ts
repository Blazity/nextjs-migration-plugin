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
  mode: "unattended" as const, goal: "wireframe" as const, inputMode: "url-only" as const,
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

  it("does NOT emit VERIFICATION.md when the user has not confirmed the page list", async () => {
    // Switch site to attended so the page-list gate is gated on the flag
    const root = mkdtempSync(join(tmpdir(), "discover-"));
    await bootstrapMigration({
      targetDir: root,
      site: { ...baseSite(baseUrl + "/"), mode: "attended" },
    });
    const matched = async (url: string) => ({
      url, matchedAdapters: ["static-html"], recommendation: "DIRECT_EXTRACTION",
      detectedCMP: null, spaAnalysis: { isSPA: false },
    });
    await runDiscover({
      targetDir: root, runDir: "001-initial",
      probeOne: matched, confirmPageList: false,
    });
    const phaseDir = join(root, ".migration/runs/001-initial/phase-1-discover");
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(false);
    const v = JSON.parse(readFileSync(join(phaseDir, "verification.json"), "utf8"));
    expect(v.criteria.find((c: { name: string }) => c.name.includes("page list")).passed).toBe(false);
  }, 60_000);
});
