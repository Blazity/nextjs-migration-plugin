import { spawn } from "node:child_process";
import getPort from "get-port";
import { detectPackageManager } from "./next-build-runner.ts";
import { runScriptCommand } from "./package-manager.ts";
import type { RunVerifyBuildBaselineResult } from "./verify-build-baseline-runner.ts";

export interface RunWithNextServerArgs {
  targetDir: string;
  verify: (localUrl: string) => Promise<RunVerifyBuildBaselineResult>;
}

const READY_TIMEOUT_MS = Number(process.env.NEXT_START_READY_TIMEOUT_MS ?? 60_000);

export async function runWithNextStartServer(args: RunWithNextServerArgs): Promise<RunVerifyBuildBaselineResult> {
  const port = await getPort({ port: [3000, 3001, 3002, 3003] });
  const localUrl = `http://127.0.0.1:${port}/`;
  const pm = detectPackageManager(args.targetDir);
  const startCommand = runScriptCommand(pm, "start", ["-p", String(port)]);

  const child = spawn(startCommand.command, startCommand.args, {
    cwd: args.targetDir,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", chunk => { output += chunk.toString(); });
  child.stderr?.on("data", chunk => { output += chunk.toString(); });

  try {
    await waitForHttp(localUrl, () => child.exitCode !== null, () => output);
    return await args.verify(localUrl);
  } finally {
    await stopProcess(child);
  }
}

async function waitForHttp(
  localUrl: string,
  exited: () => boolean,
  output: () => string,
): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited()) throw new Error(`next start exited before becoming ready.\n${output().trim()}`);
    try {
      await fetch(localUrl, { method: "HEAD" });
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Timed out waiting for next start at ${localUrl}.\n${output().trim()}`);
}

async function stopProcess(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>(resolve => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve();
    }, 2_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
