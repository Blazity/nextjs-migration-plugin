import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import getPort from "get-port";
import { runCrawl } from "../lib/crawl-runner.ts";
import { CrawlSchema } from "../schemas/crawl.ts";

const fixtureDir = fileURLToPath(new URL("./fixtures/site-fixture/", import.meta.url));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const port = await getPort();
  server = createServer((req, res) => {
    const rawUrl = req.url!.split("?")[0];
    let file: string;
    if (rawUrl === "/robots.txt") {
      file = "robots.txt";
    } else if (rawUrl === "/" || rawUrl === "") {
      file = "index.html";
    } else {
      file = `${rawUrl.replace(/^\//, "").replace(/\/$/, "")}.html`;
    }
    const path = join(fixtureDir, file);
    if (!existsSync(path)) { res.statusCode = 404; res.end("nope"); return; }
    const isHtml = file.endsWith(".html");
    res.setHeader("Content-Type", isHtml ? "text/html" : "text/plain");
    res.end(readFileSync(path, "utf8"));
  });
  await new Promise<void>(r => server.listen(port, r));
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>(r => server.close(() => r())));

describe("runCrawl", () => {
  it("crawls the seed and discovered pages, writes a schema-valid crawl.json", async () => {
    const out = mkdtempSync(join(tmpdir(), "crawl-out-"));
    const crawlPath = join(out, "crawl.json");
    await runCrawl({
      sourceUrl: baseUrl + "/",
      outputPath: crawlPath,
      maxPages: 10,
      maxDepth: 2,
    });
    expect(existsSync(crawlPath)).toBe(true);
    const data = JSON.parse(readFileSync(crawlPath, "utf8"));
    const validated = CrawlSchema.parse(data);
    const urls = validated.pages.map(p => new URL(p.url).pathname).sort();
    expect(urls).toEqual(["/", "/about", "/pricing"]);
    expect(validated.pages.find(p => p.url.endsWith("/"))?.discoveredVia).toBe("seed");
    expect(validated.pages.find(p => p.url.endsWith("/about"))?.discoveredVia).toBe("link");
  }, 30_000);

  it("does not follow external links off the source origin", async () => {
    const out = mkdtempSync(join(tmpdir(), "crawl-out-"));
    const crawlPath = join(out, "crawl.json");
    await runCrawl({
      sourceUrl: baseUrl + "/",
      outputPath: crawlPath,
      maxPages: 10,
      maxDepth: 2,
    });
    const data = CrawlSchema.parse(JSON.parse(readFileSync(crawlPath, "utf8")));
    expect(data.pages.every(p => p.url.startsWith(baseUrl))).toBe(true);
  }, 30_000);

  it("respects maxPages", async () => {
    const out = mkdtempSync(join(tmpdir(), "crawl-out-"));
    const crawlPath = join(out, "crawl.json");
    await runCrawl({
      sourceUrl: baseUrl + "/",
      outputPath: crawlPath,
      maxPages: 1,
      maxDepth: 2,
    });
    const data = CrawlSchema.parse(JSON.parse(readFileSync(crawlPath, "utf8")));
    expect(data.pages).toHaveLength(1);
  }, 30_000);
});
