import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { runCrawl } from "./crawl-runner.ts";
import { runProbeBatch } from "./probe-runner.ts";
import { loadCrawl } from "./load-crawl.ts";
import { loadProbe } from "./load-probe.ts";
import { writePlan, writeExecution, writeVerification } from "./phase-state.ts";

export interface RunDiscoverArgs {
  targetDir: string;
  runDir: string;
  maxPages?: number;
  maxDepth?: number;
  pluginRoot?: string;
  probeOne?: (url: string) => Promise<unknown>;
  confirmPageList?: boolean;
  confirmAborts?: boolean;
}

export async function runDiscover(args: RunDiscoverArgs): Promise<void> {
  const { sourceUrl, mode } = await readSiteConfig(args.targetDir);
  const phaseDir = join(args.targetDir, ".migration/runs", args.runDir, "phase-1-discover");
  const discoveryDir = join(phaseDir, "discovery");
  mkdirSync(discoveryDir, { recursive: true });

  await writePlan(
    phaseDir,
    `# Phase 1 — Discover\n\nCrawl ${sourceUrl} and probe each discovered page.\n\nMaxPages: ${args.maxPages ?? 50} | MaxDepth: ${args.maxDepth ?? 3}\n`,
  );

  const crawlPath = join(discoveryDir, "crawl.json");
  await runCrawl({
    sourceUrl,
    outputPath: crawlPath,
    maxPages: args.maxPages,
    maxDepth: args.maxDepth,
    pluginRoot: args.pluginRoot,
  });
  await writeExecution(phaseDir, `Crawl complete → ${crawlPath}`);

  const crawlResult = loadCrawl(crawlPath);
  if (!crawlResult.valid) {
    await writeVerification(phaseDir, {
      phase: "phase-1-discover",
      passed: false,
      checkedAt: new Date().toISOString(),
      criteria: [
        {
          name: "crawl.json valid",
          passed: false,
          detail: crawlResult.issues[0]?.message,
        },
      ],
    });
    return;
  }

  const probePath = join(discoveryDir, "probe.json");
  await runProbeBatch({
    urls: crawlResult.data.pages.map((p) => p.url),
    outputPath: probePath,
    pluginRoot: args.pluginRoot,
    probeOne: args.probeOne,
  });
  await writeExecution(phaseDir, `Probe complete → ${probePath}`);

  const probeResult = loadProbe(probePath);
  const probeValid = probeResult.valid;
  const aborts = probeValid
    ? probeResult.data.pages.filter((p) => p.recommendation === "ABORT_NO_ADAPTER")
    : [];

  const adapterGate = probeValid && (aborts.length === 0 || args.confirmAborts === true);
  const pageListGate = isUnattended(mode) ? true : args.confirmPageList === true;

  await writeVerification(phaseDir, {
    phase: "phase-1-discover",
    passed: crawlResult.valid && probeValid && adapterGate && pageListGate,
    checkedAt: new Date().toISOString(),
    criteria: [
      { name: "crawl.json valid", passed: crawlResult.valid },
      { name: "probe.json valid", passed: probeValid },
      {
        name: "every page has matched adapter or confirmed ABORT",
        passed: adapterGate,
        detail:
          aborts.length > 0
            ? `${aborts.length} page(s) had no matched adapter; ${args.confirmAborts ? "user confirmed" : "user has not confirmed"}.`
            : undefined,
      },
      {
        name: "user confirmed page list",
        passed: pageListGate,
        detail: isUnattended(mode)
          ? "auto-confirmed (unattended mode)"
          : args.confirmPageList
            ? "user confirmed"
            : "awaiting confirmation",
      },
    ],
  });
}

async function readSiteConfig(targetDir: string): Promise<{ sourceUrl: string; mode: string }> {
  const { loadSite } = await import("./load-site.ts");
  const result = loadSite(join(targetDir, ".migration/SITE.md"));
  if (!result.valid) throw new Error(`SITE.md is invalid: ${JSON.stringify(result.issues)}`);
  return { sourceUrl: result.site.sourceUrl, mode: result.site.mode };
}

function isUnattended(mode: string): boolean {
  return mode === "unattended";
}
