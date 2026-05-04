import { execFile as defaultExecFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

const promisifiedDefault = promisify(defaultExecFile);

export interface RunVerifyBuildBaselineArgs {
  referenceUrl: string;
  localUrl: string;
  specsDir: string;
  adapterPath: string;
  pluginRoot: string;
}

export interface RunVerifyBuildBaselineDeps {
  execFile?: (cmd: string, args: string[], opts?: object) => Promise<{ stdout: string; stderr: string }>;
}

export interface RunVerifyBuildBaselineResult {
  passed: boolean;
  detail?: string;
}

const VERIFY_TIMEOUT_MS = Number(process.env.VERIFY_BASELINE_TIMEOUT_MS ?? 180_000);

export async function runVerifyBuildBaseline(
  args: RunVerifyBuildBaselineArgs,
  deps: RunVerifyBuildBaselineDeps = {},
): Promise<RunVerifyBuildBaselineResult> {
  const exec = deps.execFile ?? promisifiedDefault;
  const script = resolve(args.pluginRoot, "scripts/verify-build-baseline.ts");
  try {
    await exec(
      "npx",
      ["tsx", script, args.referenceUrl, args.localUrl, args.specsDir, "--adapter", args.adapterPath],
      { env: process.env, timeout: VERIFY_TIMEOUT_MS, killSignal: "SIGKILL" },
    );
    return { passed: true };
  } catch (err) {
    const e = err as Error & { stderr?: string };
    return { passed: false, detail: e.stderr ?? e.message };
  }
}
