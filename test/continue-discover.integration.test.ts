import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "node:http";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import getPort from "get-port";
import { resumeMigration } from "../lib/continue.ts";
import { runDiscover } from "../lib/discover.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";

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

describe("continue → discover end-to-end", () => {
  it("runs phase-1-discover and produces verified crawl.json", async () => {
    const root = mkdtempSync(join(tmpdir(), "e2e-"));
    await bootstrapMigration({
      targetDir: root,
      site: {
        sourceUrl: baseUrl + "/", target: "./",
        mode: "unattended", goal: "wireframe", inputMode: "url-only",
        maxParallelPages: 4, maxParallelSections: 4,
      },
    });
    const dispatchers = {
      "phase-1-discover": async ({ targetDir, runDir }: { targetDir: string; runDir: string }) => {
        await runDiscover({
          targetDir, runDir,
          probeOne: async (url) => ({
            url, matchedAdapters: ["static-html"], recommendation: "DIRECT_EXTRACTION",
            detectedCMP: null, spaAnalysis: { isSPA: false },
          }),
        });
      },
    };
    const result = await resumeMigration(root, { dispatchers });
    expect(result.kind).toBe("dispatched");
    if (result.kind === "dispatched") expect(result.phase).toBe("phase-1-discover");
    expect(existsSync(join(root, ".migration/runs/001-initial/phase-1-discover/discovery/crawl.json"))).toBe(true);
    expect(existsSync(join(root, ".migration/runs/001-initial/phase-1-discover/VERIFICATION.md"))).toBe(true);
  }, 60_000);
});
