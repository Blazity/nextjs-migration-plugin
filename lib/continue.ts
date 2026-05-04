import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadSite } from "./load-site.ts";
import { firstIncompletePhase } from "./phase-status.ts";
import { runDiscover } from "./discover.ts";
import { runAnalyze } from "./analyze.ts";
import { runPlan } from "./plan.ts";
import { runExtract } from "./extract.ts";
import { runBuild } from "./build.ts";
import { loadAdapter } from "./load-adapter.ts";
import { loadProbe } from "./load-probe.ts";

export type PhaseDispatcher = (args: { targetDir: string; runDir: string }) => Promise<void>;

export type ResumeResult =
  | { kind: "not-initialized" }
  | { kind: "all-done" }
  | { kind: "dispatched"; phase: string; runDir: string }
  | { kind: "no-dispatcher"; phase: string; runDir: string };

export interface ResumeArgs {
  dispatchers?: Record<string, PhaseDispatcher>;
}

export async function resumeMigration(
  targetDir: string,
  args: ResumeArgs,
): Promise<ResumeResult> {
  const migDir = join(targetDir, ".migration");
  if (!existsSync(migDir)) return { kind: "not-initialized" };

  const siteResult = loadSite(join(migDir, "SITE.md"));
  if (!siteResult.valid) {
    throw new Error(`SITE.md is invalid: ${JSON.stringify(siteResult.issues)}`);
  }

  const runs = readdirSync(join(migDir, "runs"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const activeRun = runs[runs.length - 1] ?? "001-initial";
  const runDir = join(migDir, "runs", activeRun);

  const next = firstIncompletePhase(runDir, { goal: siteResult.site.goal });
  if (next === null) return { kind: "all-done" };

  const dispatcher = args.dispatchers?.[next];
  if (!dispatcher) return { kind: "no-dispatcher", phase: next, runDir: activeRun };

  await dispatcher({ targetDir, runDir: activeRun });
  return { kind: "dispatched", phase: next, runDir: activeRun };
}

export function defaultDispatchers(): Record<string, PhaseDispatcher> {
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

async function resolveAdapterDiscovery(
  targetDir: string,
  runDir: string,
): Promise<{ primarySelector: string; skipSelectors: string[] }> {
  const probePath = join(targetDir, ".migration/runs", runDir, "phase-1-discover/discovery/probe.json");
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
  const sd = adapterResult.data.sectionDiscovery;
  // SectionDiscoverySchema accepts both `primarySelector` (vendored adapters)
  // and `selector` (plugin-internal fixtures). Prefer the more specific one,
  // falling back to a generic body-children selector.
  return {
    primarySelector: sd?.primarySelector ?? sd?.selector ?? "body > *",
    skipSelectors: sd?.skipSelectors ?? [],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const get = (flag: string) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const targetDir = get("--target") ?? process.cwd();
  resumeMigration(targetDir, { dispatchers: defaultDispatchers() })
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      if (result.kind === "no-dispatcher") process.exit(2);
    })
    .catch(err => { console.error(err.message); process.exit(1); });
}
