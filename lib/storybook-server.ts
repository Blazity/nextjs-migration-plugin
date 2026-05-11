import { spawn as defaultSpawn, type ChildProcess } from "node:child_process";
import { execFile as defaultExecFile } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import getPort from "get-port";
import { ensureStorybookScaffold } from "./storybook-scaffold.ts";
import { detectPackageManager } from "./next-build-runner.ts";
import { installCommand, runScriptCommand, type PackageCommand, type PackageManager } from "./package-manager.ts";

const execFile = promisify(defaultExecFile);

export interface StorybookServerContext {
  baseUrl: string;
}

export interface WithStorybookServerArgs<T> {
  targetDir: string;
  baseUrl?: string;
  run: (context: StorybookServerContext) => Promise<T> | T;
  readinessAttempts?: number;
}

export interface StorybookProcess {
  kill(signal?: NodeJS.Signals): boolean;
  once(event: "exit", listener: (...args: unknown[]) => void): this;
  once(event: "error", listener: (error: Error) => void): this;
  stdout?: {
    on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  };
  stderr?: {
    on(event: "data", listener: (chunk: Buffer | string) => void): unknown;
  };
}

export interface StorybookServerDeps {
  getPort?: () => Promise<number>;
  spawn?: (
    command: string,
    args: string[],
    options: Parameters<typeof defaultSpawn>[2],
  ) => StorybookProcess;
  install?: (
    command: string,
    args: string[],
    options: { cwd: string; env: NodeJS.ProcessEnv },
  ) => Promise<void>;
  hasStorybookExecutable?: (targetDir: string, packageManager: PackageManager) => boolean;
  fetch?: (url: string) => Promise<Pick<Response, "ok">>;
  sleep?: (ms: number) => Promise<void>;
}

export async function withStorybookServer<T>(
  args: WithStorybookServerArgs<T>,
  deps: StorybookServerDeps = {},
): Promise<T> {
  if (args.baseUrl) {
    return args.run({ baseUrl: normalizeBaseUrl(args.baseUrl) });
  }

  const scaffold = ensureStorybookScaffold(args.targetDir);
  const packageManager = detectPackageManager(args.targetDir);

  if (
    scaffold.packageJsonChanged ||
    !(deps.hasStorybookExecutable ?? hasStorybookExecutable)(args.targetDir, packageManager)
  ) {
    const install = deps.install ?? defaultInstall;
    const command = installCommand(packageManager);
    await install(command.command, command.args, {
      cwd: args.targetDir,
      env: process.env,
    });
  }

  const port = await (deps.getPort ?? (() => getPort({ port: 6006 })))();
  const baseUrl = `http://127.0.0.1:${port}`;
  const spawn = deps.spawn ?? ((command, spawnArgs, options) =>
    defaultSpawn(command, spawnArgs, {
      ...options,
      stdio: "pipe",
    }) as ChildProcess as StorybookProcess);
  const storybookCommand = runStorybookCommand(packageManager, port);
  const childProcess = spawn(storybookCommand.command, storybookCommand.args, {
    cwd: args.targetDir,
    env: processEnv(),
    stdio: "pipe",
  });
  const processState = observeProcess(childProcess);

  try {
    await waitForStorybookReady({
      baseUrl,
      attempts: args.readinessAttempts ?? 100,
      fetch: deps.fetch ?? defaultFetch,
      sleep: deps.sleep ?? sleep,
      processExited: () => processState.exited,
      processError: () => processState.error,
      processOutput: () => processState.output,
    });
    return await args.run({ baseUrl });
  } finally {
    await stopProcess(childProcess);
  }
}

async function waitForStorybookReady(args: {
  baseUrl: string;
  attempts: number;
  fetch: (url: string) => Promise<Pick<Response, "ok">>;
  sleep: (ms: number) => Promise<void>;
  processExited: () => boolean;
  processError: () => Error | undefined;
  processOutput: () => string;
}): Promise<void> {
  const iframeUrl = `${args.baseUrl}/iframe.html`;
  for (let attempt = 0; attempt < args.attempts; attempt += 1) {
    throwIfStorybookProcessFailed(args, iframeUrl);
    try {
      const response = await args.fetch(iframeUrl);
      if (response.ok) return;
    } catch {
      // Storybook may still be booting.
    }
    throwIfStorybookProcessFailed(args, iframeUrl);
    await args.sleep(250);
  }

  throw new Error(withProcessOutput(
    `Storybook did not become ready at ${iframeUrl}.`,
    args.processOutput(),
  ));
}

async function stopProcess(process: StorybookProcess): Promise<void> {
  await new Promise<void>((resolve) => {
    process.once("exit", () => resolve());
    if (!process.kill("SIGTERM")) resolve();
  });
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

async function defaultFetch(url: string): Promise<Pick<Response, "ok">> {
  return fetch(url);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function processEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BROWSER: "none",
  };
}

function runStorybookCommand(packageManager: ReturnType<typeof detectPackageManager>, port: number): PackageCommand {
  return runScriptCommand(packageManager, "storybook", ["--port", String(port), "--ci"]);
}

async function defaultInstall(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<void> {
  await execFile(command, args, options);
}

function hasStorybookExecutable(targetDir: string, packageManager: PackageManager): boolean {
  if (existsSync(join(targetDir, "node_modules", ".bin", "storybook"))) return true;
  if (existsSync(join(targetDir, "node_modules", "storybook"))) return true;
  if (packageManager === "pnpm" && hasPnpmNestedStorybookPackage(targetDir)) return true;
  if (packageManager === "yarn" && hasYarnPnpStorybookPackage(targetDir)) return true;
  return false;
}

function observeProcess(process: StorybookProcess): { exited: boolean; output: string; error?: Error } {
  const state: { exited: boolean; output: string; error?: Error } = {
    exited: false,
    output: "",
  };
  process.once("error", error => {
    state.exited = true;
    state.error = error;
  });
  process.once("exit", () => {
    state.exited = true;
  });
  process.stdout?.on("data", chunk => {
    state.output += chunk.toString();
  });
  process.stderr?.on("data", chunk => {
    state.output += chunk.toString();
  });
  return state;
}

function throwIfStorybookProcessFailed(
  args: {
    processExited: () => boolean;
    processError: () => Error | undefined;
    processOutput: () => string;
  },
  iframeUrl: string,
): void {
  const error = args.processError();
  if (error) {
    throw new Error(withProcessOutput(
      `Storybook failed before becoming ready at ${iframeUrl}: ${error.message}`,
      args.processOutput(),
    ));
  }

  if (args.processExited()) {
    throw new Error(withProcessOutput(
      `Storybook exited before becoming ready at ${iframeUrl}.`,
      args.processOutput(),
    ));
  }
}

function withProcessOutput(message: string, output: string): string {
  const trimmedOutput = output.trim();
  return trimmedOutput.length > 0 ? `${message}\n${trimmedOutput}` : message;
}

function hasPnpmNestedStorybookPackage(targetDir: string): boolean {
  const pnpmDir = join(targetDir, "node_modules", ".pnpm");
  if (!existsSync(pnpmDir)) return false;

  try {
    return readdirSync(pnpmDir, { withFileTypes: true }).some(entry =>
      entry.isDirectory() && entry.name.startsWith("storybook@"));
  } catch {
    return false;
  }
}

function hasYarnPnpStorybookPackage(targetDir: string): boolean {
  if (!existsSync(join(targetDir, ".pnp.cjs")) && !existsSync(join(targetDir, ".pnp.js"))) {
    return false;
  }

  const packageJson = readPackageJson(targetDir);
  if (!packageJson) return false;

  const scripts = isRecord(packageJson.scripts) ? packageJson.scripts : {};
  return typeof scripts.storybook === "string" && hasStorybookDependency(packageJson);
}

function hasStorybookDependency(packageJson: Record<string, unknown>): boolean {
  const dependencies = isRecord(packageJson.dependencies) ? packageJson.dependencies : {};
  const devDependencies = isRecord(packageJson.devDependencies) ? packageJson.devDependencies : {};
  return "storybook" in dependencies || "storybook" in devDependencies;
}

function readPackageJson(targetDir: string): Record<string, unknown> | undefined {
  try {
    const packageJson = JSON.parse(readFileSync(join(targetDir, "package.json"), "utf8"));
    return isRecord(packageJson) ? packageJson : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
