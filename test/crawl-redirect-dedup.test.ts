import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import getPort from "get-port";
import { runCrawl } from "../lib/crawl-runner.ts";
import { CrawlSchema } from "../schemas/crawl.ts";

let server: Server;
let baseUrl: string;

// Fixture topology — `/old` and `/old-trailing/` both 301 to `/new`. The seed
// `/index.html` links to ALL three so the crawler queues both redirect-source
// URLs and the canonical. Without dedup at goto-time, crawl.json would record
// three entries for one logical page (see knowledge/open-issues/002).
beforeAll(async () => {
  const port = await getPort();
  server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/robots.txt") {
      res.setHeader("Content-Type", "text/plain");
      res.end("User-agent: *\nAllow: /\n");
      return;
    }
    if (path === "/" || path === "/index.html") {
      res.setHeader("Content-Type", "text/html");
      res.end('<html><body><a href="/old">old</a><a href="/new">new</a><a href="/old-trailing/">slash</a></body></html>');
      return;
    }
    if (path === "/old" || path === "/old-trailing/" || path === "/old-trailing") {
      res.statusCode = 301;
      res.setHeader("Location", `${baseUrl}/new`);
      res.end();
      return;
    }
    if (path === "/new") {
      res.setHeader("Content-Type", "text/html");
      res.end("<html><body><h1>canonical</h1></body></html>");
      return;
    }
    res.statusCode = 404;
    res.end("nope");
  });
  const port2 = await getPort();
  await new Promise<void>(r => server.listen(port2, r));
  baseUrl = `http://127.0.0.1:${port2}`;
}, 30_000);

afterAll(() => new Promise<void>(r => server.close(() => r())));

describe("crawl-site redirect dedup (issue 002)", () => {
  it("collapses /old → /new redirects so crawl.json contains only the canonical URL", async () => {
    const out = mkdtempSync(join(tmpdir(), "crawl-redir-"));
    const crawlPath = join(out, "crawl.json");
    await runCrawl({
      sourceUrl: `${baseUrl}/`,
      outputPath: crawlPath,
      maxPages: 10,
      maxDepth: 2,
    });
    expect(existsSync(crawlPath)).toBe(true);
    const data = CrawlSchema.parse(JSON.parse(readFileSync(crawlPath, "utf8")));
    const paths = data.pages.map(p => new URL(p.url).pathname).sort();
    expect(paths).toEqual(["/", "/new"]);
    // /old must not appear under any path variant
    expect(data.pages.find(p => p.url.includes("/old"))).toBeUndefined();
  }, 30_000);
});
