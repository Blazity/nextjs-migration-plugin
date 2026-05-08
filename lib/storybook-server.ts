import { spawn as defaultSpawn, type ChildProcess } from "node:child_process";
import getPort from "get-port";
import { ensureStorybookScaffold } from "./storybook-scaffold.ts";

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
}

export interface StorybookServerDeps {
  getPort?: () => Promise<number>;
  spawn?: (
    command: string,
    args: string[],
    options: Parameters<typeof defaultSpawn>[2],
  ) => StorybookProcess;
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

  ensureStorybookScaffold(args.targetDir);

  const port = await (deps.getPort ?? (() => getPort({ port: 6006 })))();
  const baseUrl = `http://127.0.0.1:${port}`;
  const spawn = deps.spawn ?? ((command, spawnArgs, options) =>
    defaultSpawn(command, spawnArgs, {
      ...options,
      stdio: "pipe",
    }) as ChildProcess as StorybookProcess);
  const process = spawn(
    "pnpm",
    ["exec", "storybook", "dev", "--port", String(port), "--ci"],
    {
      cwd: args.targetDir,
      env: processEnv(),
      stdio: "pipe",
    },
  );

  try {
    await waitForStorybookReady({
      baseUrl,
      attempts: args.readinessAttempts ?? 100,
      fetch: deps.fetch ?? defaultFetch,
      sleep: deps.sleep ?? sleep,
    });
    return await args.run({ baseUrl });
  } finally {
    await stopProcess(process);
  }
}

async function waitForStorybookReady(args: {
  baseUrl: string;
  attempts: number;
  fetch: (url: string) => Promise<Pick<Response, "ok">>;
  sleep: (ms: number) => Promise<void>;
}): Promise<void> {
  const iframeUrl = `${args.baseUrl}/iframe.html`;
  for (let attempt = 0; attempt < args.attempts; attempt += 1) {
    try {
      const response = await args.fetch(iframeUrl);
      if (response.ok) return;
    } catch {
      // Storybook may still be booting.
    }
    await args.sleep(250);
  }

  throw new Error(`Storybook did not become ready at ${iframeUrl}`);
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
