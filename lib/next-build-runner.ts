import { execFile as defaultExecFile } from "node:child_process";
import { promisify } from "node:util";
import { detectPackageManager, runScriptCommand, type PackageManager } from "./package-manager.ts";

const promisifiedDefault = promisify(defaultExecFile);

export { detectPackageManager, type PackageManager };

export interface RunNextBuildArgs {
  targetDir: string;
}

export interface RunNextBuildDeps {
  execFile?: (cmd: string, args: string[], opts?: object) => Promise<{ stdout: string; stderr: string }>;
}

export interface RunNextBuildResult {
  exitCode: 0 | 1;
  stdout: string;
  stderr: string;
  packageManager: PackageManager;
}

const BUILD_TIMEOUT_MS = Number(process.env.NEXT_BUILD_TIMEOUT_MS ?? 600_000);

export async function runNextBuild(
  args: RunNextBuildArgs,
  deps: RunNextBuildDeps = {},
): Promise<RunNextBuildResult> {
  const exec = deps.execFile ?? promisifiedDefault;
  const pm = detectPackageManager(args.targetDir);
  const buildCommand = runScriptCommand(pm, "build");
  try {
    const result = await exec(buildCommand.command, buildCommand.args, {
      cwd: args.targetDir,
      env: process.env,
      timeout: BUILD_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr, packageManager: pm };
  } catch (err) {
    const e = err as Error & { stdout?: string; stderr?: string };
    return { exitCode: 1, stdout: e.stdout ?? "", stderr: e.stderr ?? e.message, packageManager: pm };
  }
}
