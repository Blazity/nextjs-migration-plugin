import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runAnalyze } from "./analyze.ts";
import { runBuild } from "./build.ts";
import { runDiscover } from "./discover.ts";
import { runExtract } from "./extract.ts";
import { firstIncompletePhase } from "./phase-status.ts";
import { runPlan } from "./plan.ts";
import { loadAdapter } from "./load-adapter.ts";
import { loadProbe } from "./load-probe.ts";
import { loadSite } from "./load-site.ts";

export type LegacyPhaseDispatcher = (args: {
  targetDir: string;
  runDir: string;
}) => Promise<void>;

export type LegacyResumeResult =
  | { kind: "not-initialized" }
  | { kind: "all-done" }
  | { kind: "dispatched"; phase: string; runDir: string }
  | { kind: "no-dispatcher"; phase: string; runDir: string };

export interface LegacyResumeArgs {
  dispatchers?: Record<string, LegacyPhaseDispatcher>;
}

export async function resumeLegacyMigration(
  targetDir: string,
  args: LegacyResumeArgs = {},
): Promise<LegacyResumeResult> {
  const migrationDir = join(targetDir, ".migration");
  if (!existsSync(migrationDir)) return { kind: "not-initialized" };

  const siteResult = loadSite(join(migrationDir, "SITE.md"));
  if (!siteResult.valid) {
    throw new Error(`SITE.md is invalid: ${JSON.stringify(siteResult.issues)}`);
  }

  const runs = readdirSync(join(migrationDir, "runs"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const activeRun = runs[runs.length - 1] ?? "001-initial";
  const runDir = join(migrationDir, "runs", activeRun);

  const next = isPolishRun(runDir)
    ? firstIncompletePolishPhase(runDir)
    : firstIncompletePhase(runDir);
  if (next === null) return { kind: "all-done" };

  const dispatcher = args.dispatchers?.[next];
  if (!dispatcher) return { kind: "no-dispatcher", phase: next, runDir: activeRun };

  await dispatcher({ targetDir, runDir: activeRun });
  return { kind: "dispatched", phase: next, runDir: activeRun };
}

export function legacyDefaultDispatchers(): Record<string, LegacyPhaseDispatcher> {
  return {
    "phase-1-discover": async ({ targetDir, runDir }) => {
      await runDiscover({ targetDir, runDir });
    },
    "phase-2-analyze": async ({ targetDir, runDir }) => {
      const adapter = await resolveAdapterDiscovery(targetDir, runDir);
      await runAnalyze({
        targetDir,
        runDir,
        primarySelector: adapter.primarySelector,
        skipSelectors: adapter.skipSelectors,
      });
    },
    "phase-3-plan": async ({ targetDir, runDir }) => {
      await runPlan({ targetDir, runDir });
    },
    "phase-4-extract": async ({ targetDir, runDir }) => {
      await runExtract({ targetDir, runDir });
    },
    "phase-5-build": async ({ targetDir, runDir }) => {
      await runBuild({ targetDir, runDir });
    },
  };
}

function isPolishRun(runDir: string): boolean {
  const runMd = join(runDir, "RUN.md");
  if (!existsSync(runMd)) return false;
  return readFileSync(runMd, "utf8").includes("Run type: polish");
}

function firstIncompletePolishPhase(runDir: string): string | null {
  for (const phase of ["phase-6-visual", "phase-7-animate", "phase-8-perf"]) {
    if (!existsSync(join(runDir, phase, "VERIFICATION.md"))) return phase;
  }
  return null;
}

async function resolveAdapterDiscovery(
  targetDir: string,
  runDir: string,
): Promise<{ primarySelector: string; skipSelectors: string[] }> {
  const probePath = join(
    targetDir,
    ".migration/runs",
    runDir,
    "phase-1-discover/discovery/probe.json",
  );
  const probeResult = loadProbe(probePath);
  if (!probeResult.valid) {
    throw new Error(`Cannot resolve adapter: probe.json invalid at ${probePath}`);
  }
  const adapterPath = probeResult.data.pages[0]?.matchedAdapters[0];
  if (!adapterPath) {
    throw new Error("Cannot resolve adapter: probe.json has no matchedAdapters");
  }
  const adapterResult = loadAdapter(adapterPath);
  if (!adapterResult.valid) {
    throw new Error(`Cannot resolve adapter: adapter invalid at ${adapterPath}`);
  }
  const sectionDiscovery = adapterResult.data.sectionDiscovery;
  return {
    primarySelector: sectionDiscovery?.primarySelector ??
      sectionDiscovery?.selector ??
      "body > *",
    skipSelectors: sectionDiscovery?.skipSelectors ?? [],
  };
}
