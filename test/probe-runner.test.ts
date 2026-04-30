import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runProbeBatch } from "../lib/probe-runner.ts";
import { ProbeSchema } from "../schemas/probe.ts";

const fixtureRaw = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/probe-output/${name}`, import.meta.url)), "utf8");

describe("runProbeBatch", () => {
  it("aggregates per-URL probe outputs into a schema-valid probe.json", async () => {
    const out = mkdtempSync(join(tmpdir(), "probe-out-"));
    const outPath = join(out, "probe.json");
    const stub = async (url: string) => {
      if (url.endsWith("/spa")) return JSON.parse(fixtureRaw("unmatched.json"));
      return JSON.parse(fixtureRaw("webflow.json"));
    };
    await runProbeBatch({
      urls: ["https://example.com/", "https://example.com/spa"],
      outputPath: outPath,
      probeOne: stub,
    });
    expect(existsSync(outPath)).toBe(true);
    const validated = ProbeSchema.parse(JSON.parse(readFileSync(outPath, "utf8")));
    expect(validated.pages).toHaveLength(2);
    expect(validated.pages[1].recommendation).toBe("ABORT_NO_ADAPTER");
    expect(validated.pages[1].detectedCMP).toBe("OneTrust");
    expect(validated.pages[1].isSPA).toBe(true);
  });

  it("captures per-URL failures as ABORT_NO_ADAPTER + isSPA:false", async () => {
    const out = mkdtempSync(join(tmpdir(), "probe-out-"));
    const outPath = join(out, "probe.json");
    const stub = async () => { throw new Error("network kaboom"); };
    await runProbeBatch({
      urls: ["https://example.com/"],
      outputPath: outPath,
      probeOne: stub,
    });
    const validated = ProbeSchema.parse(JSON.parse(readFileSync(outPath, "utf8")));
    expect(validated.pages[0].recommendation).toBe("ABORT_NO_ADAPTER");
    expect(validated.pages[0].matchedAdapters).toEqual([]);
  });
});
