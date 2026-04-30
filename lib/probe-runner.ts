import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ProbeSchema, type ProbedPage } from "../schemas/probe.ts";

const execFileP = promisify(execFile);

export interface RunProbeBatchArgs {
  urls: string[];
  outputPath: string;
  pluginRoot?: string;
  probeOne?: (url: string) => Promise<unknown>;
}

export async function runProbeBatch(args: RunProbeBatchArgs): Promise<void> {
  const probeOne = args.probeOne ?? defaultProbeOne(args.pluginRoot);
  const pages: ProbedPage[] = [];
  for (const url of args.urls) {
    try {
      const raw = await probeOne(url);
      pages.push(normalize(raw, url));
    } catch (err) {
      pages.push({
        url, matchedAdapters: [], recommendation: "ABORT_NO_ADAPTER",
        detectedCMP: null, isSPA: false,
      });
    }
  }
  const probe = { probedAt: new Date().toISOString(), pages };
  const validated = ProbeSchema.parse(probe);
  mkdirSync(dirname(args.outputPath), { recursive: true });
  writeFileSync(args.outputPath, JSON.stringify(validated, null, 2));
}

function normalize(raw: unknown, url: string): ProbedPage {
  const r = raw as Record<string, unknown>;
  const isSPA = Boolean(
    (r.spaAnalysis as Record<string, unknown> | undefined)?.isSPA ?? r.isSPA ?? false,
  );
  return {
    url: (r.url as string) ?? url,
    matchedAdapters: Array.isArray(r.matchedAdapters) ? (r.matchedAdapters as string[]) : [],
    recommendation: (r.recommendation as ProbedPage["recommendation"]) ?? "ABORT_NO_ADAPTER",
    detectedCMP: (r.detectedCMP as string | null | undefined) ?? null,
    isSPA,
  };
}

function defaultProbeOne(pluginRoot?: string): (url: string) => Promise<unknown> {
  const root = pluginRoot ?? resolve(fileURLToPath(new URL("..", import.meta.url)));
  const script = resolve(root, "scripts/probe-page.ts");
  return async (url: string) => {
    const { stdout } = await execFileP("npx", ["tsx", script, url], { env: process.env });
    const lastJson = extractTrailingJson(stdout);
    return JSON.parse(lastJson);
  };
}

function extractTrailingJson(stdout: string): string {
  const end = stdout.lastIndexOf("}");
  if (end < 0) throw new Error("no JSON in probe-page output");
  let depth = 0;
  for (let i = end; i >= 0; i--) {
    const ch = stdout[i];
    if (ch === "}") depth++;
    else if (ch === "{") {
      depth--;
      if (depth === 0) return stdout.slice(i, end + 1);
    }
  }
  throw new Error("unbalanced JSON in probe-page output");
}
