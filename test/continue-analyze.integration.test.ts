import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import getPort from "get-port";
import { resumeMigration } from "../lib/continue.ts";
import { runAnalyze } from "../lib/analyze.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";

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

function writePhase1(targetDir: string, runDir: string, urls: string[]) {
  const phaseDir = join(targetDir, ".migration/runs", runDir, "phase-1-discover");
  const discoveryDir = join(phaseDir, "discovery");
  mkdirSync(discoveryDir, { recursive: true });
  writeFileSync(join(discoveryDir, "crawl.json"), JSON.stringify({
    sourceUrl: urls[0],
    crawledAt: new Date().toISOString(),
    limits: { maxPages: 10, maxDepth: 2 },
    sitemapUrls: [],
    pages: urls.map((u, i) => ({
      url: u, slug: i === 0 ? "home" : `p${i}`, title: u, depth: i === 0 ? 0 : 1,
      discoveredVia: i === 0 ? "seed" : "link", status: 200, outboundLinks: [],
    })),
    errors: [],
  }, null, 2));
  writeFileSync(join(phaseDir, "VERIFICATION.md"), "# verified");
}

describe("continue → analyze end-to-end", () => {
  it("dispatches phase-2-analyze when phase-1 has verified", async () => {
    const root = mkdtempSync(join(tmpdir(), "e2e-analyze-"));
    await bootstrapMigration({
      targetDir: root,
      site: {
        sourceUrl: baseUrl + "/", target: "./",
        mode: "unattended", goal: "wireframe", inputMode: "url-only",
        maxParallelPages: 4, maxParallelSections: 4,
      },
    });
    const urls = [baseUrl + "/", baseUrl + "/about", baseUrl + "/pricing", baseUrl + "/case-study-x"];
    writePhase1(root, "001-initial", urls);

    const dispatchers = {
      "phase-2-analyze": async ({ targetDir, runDir }: { targetDir: string; runDir: string }) => {
        await runAnalyze({
          targetDir, runDir,
          primarySelector: "body > header, body > main > *, body > footer",
        });
      },
    };
    const result = await resumeMigration(root, { dispatchers });
    expect(result.kind).toBe("dispatched");
    if (result.kind === "dispatched") expect(result.phase).toBe("phase-2-analyze");
    expect(existsSync(join(root, ".migration/library/components.json"))).toBe(true);
    expect(existsSync(join(root, ".migration/library/routes.json"))).toBe(true);
    expect(existsSync(join(root, ".migration/runs/001-initial/phase-2-analyze/VERIFICATION.md"))).toBe(true);
  }, 60_000);
});
