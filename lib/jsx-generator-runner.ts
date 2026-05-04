import { execFile as defaultExecFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

const promisifiedDefault = promisify(defaultExecFile);

export interface RunJsxGenerationArgs {
  specsDir: string;
  outputDir: string;
  pluginRoot: string;
}

export interface RunJsxGenerationDeps {
  execFile?: (cmd: string, args: string[], opts?: object) => Promise<{ stdout: string; stderr: string }>;
}

export interface RunJsxGenerationResult {
  durationMs: number;
}

const SUBPROCESS_TIMEOUT_MS = Number(process.env.BUILD_SUBPROCESS_TIMEOUT_MS ?? 120_000);

export async function runJsxGeneration(
  args: RunJsxGenerationArgs,
  deps: RunJsxGenerationDeps = {},
): Promise<RunJsxGenerationResult> {
  const exec = deps.execFile ?? promisifiedDefault;
  const script = resolve(args.pluginRoot, "scripts/generate-jsx.ts");
  const start = Date.now();
  await exec("npx", ["tsx", script, args.specsDir, args.outputDir], {
    env: process.env,
    timeout: SUBPROCESS_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
  return { durationMs: Date.now() - start };
}
