import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "node:http";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import getPort from "get-port";
import { runDiscoverSections } from "../lib/discover-sections-runner.ts";
import { DiscoveredSectionsSchema } from "../schemas/sections.ts";

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

describe("runDiscoverSections", () => {
  it("probes each URL with the supplied selector and writes a schema-valid sections.json", async () => {
    const out = mkdtempSync(join(tmpdir(), "sections-"));
    const outPath = join(out, "sections.json");
    await runDiscoverSections({
      urls: [baseUrl + "/", baseUrl + "/about", baseUrl + "/pricing"],
      primarySelector: "body > header, body > main > *, body > footer",
      outputPath: outPath,
    });
    expect(existsSync(outPath)).toBe(true);
    const validated = DiscoveredSectionsSchema.parse(
      JSON.parse(readFileSync(outPath, "utf8"))
    );
    expect(validated.pages).toHaveLength(3);
    for (const p of validated.pages) {
      expect(p.sections.length).toBeGreaterThan(0);
    }
    for (const p of validated.pages) {
      for (const s of p.sections) {
        expect(s.tagSkeleton.length).toBeGreaterThan(0);
        expect(s.pathShingles.length).toBeGreaterThan(0);
        expect(typeof s.boundingBox.width).toBe("number");
      }
    }
  }, 60_000);

  it("emits per-URL ids that include the page index and section index", async () => {
    const out = mkdtempSync(join(tmpdir(), "sections-"));
    const outPath = join(out, "sections.json");
    await runDiscoverSections({
      urls: [baseUrl + "/"],
      primarySelector: "body > header, body > main > *, body > footer",
      outputPath: outPath,
    });
    const data = DiscoveredSectionsSchema.parse(JSON.parse(readFileSync(outPath, "utf8")));
    const ids = data.pages[0].sections.map(s => s.id);
    expect(ids.every(id => /^p\d+-s\d+$/.test(id))).toBe(true);
  }, 60_000);

  it("discovers sections inside a single root wrapper and emits section signals", async () => {
    const out = mkdtempSync(join(tmpdir(), "sections-"));
    const outPath = join(out, "sections.json");
    await runDiscoverSections({
      urls: [baseUrl + "/root-wrapper"],
      primarySelector: "body > header, body > nav, body > main > *, body > section, body > article, body > aside, body > footer",
      outputPath: outPath,
    });

    const data = DiscoveredSectionsSchema.parse(JSON.parse(readFileSync(outPath, "utf8")));
    const sections = data.pages[0].sections;
    expect(sections.map(section => section.sampleText)).toEqual([
      "Wrapped Hero Lead copy.",
      "First Second Third",
      "Email Send",
    ]);
    expect(sections[0].selector).toContain("body > :not(");
    expect(sections[0].tagSkeleton).toContain("strong");
    expect(sections[1].signals).toMatchObject({
      imgCount: "2-4",
      liCount: "1-3",
      textLen: "<50",
    });
    expect(sections[2].signals).toMatchObject({
      formCount: "1+",
      buttonCount: "1",
    });
  }, 60_000);

  it("discovers wrapped main content even when top-level shell sections also match", async () => {
    const out = mkdtempSync(join(tmpdir(), "sections-"));
    const outPath = join(out, "sections.json");
    await runDiscoverSections({
      urls: [baseUrl + "/mixed-wrapper"],
      primarySelector: "body > header, body > nav, body > main > *, body > section, body > article, body > aside, body > footer",
      outputPath: outPath,
    });

    const data = DiscoveredSectionsSchema.parse(JSON.parse(readFileSync(outPath, "utf8")));
    expect(data.pages[0].sections.map(section => section.sampleText)).toEqual([
      "Home",
      "Mixed Wrapped Hero",
      "Wrapped CTA Start",
      "Footer",
    ]);
  }, 60_000);
});
