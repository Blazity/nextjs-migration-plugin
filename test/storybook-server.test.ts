import { EventEmitter } from "node:events";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withStorybookServer } from "../lib/storybook-server.ts";

describe("withStorybookServer", () => {
  it("starts Storybook on an available port, waits for iframe readiness, and stops after success", async () => {
    const targetDir = createTarget();
    const process = fakeProcess();
    const spawn = vi.fn(() => process);
    const install = vi.fn(async () => undefined);
    const fetch = vi.fn(async (_url: string): Promise<Pick<Response, "ok">> => ({ ok: true }));
    fetch
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });
    const run = vi.fn(async ({ baseUrl }: { baseUrl: string }) => `ran:${baseUrl}`);

    const result = await withStorybookServer(
      { targetDir, run },
      {
        getPort: async () => 6123,
        spawn,
        install,
        fetch,
        sleep: async () => {},
      },
    );

    expect(result).toBe("ran:http://127.0.0.1:6123");
    expect(install).toHaveBeenCalledWith(
      "npm",
      ["install"],
      expect.objectContaining({ cwd: targetDir }),
    );
    expect(spawn).toHaveBeenCalledWith(
      "npm",
      ["run", "storybook", "--", "--port", "6123", "--ci"],
      expect.objectContaining({ cwd: targetDir }),
    );
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:6123/iframe.html");
    expect(process.killCalls).toEqual(["SIGTERM"]);
  });

  it("uses Bun to install and run the Storybook package script for Bun targets", async () => {
    const targetDir = createTarget({ packageManager: "bun@1.3.0" });
    const process = fakeProcess();
    const spawn = vi.fn(() => process);
    const install = vi.fn(async () => undefined);

    await withStorybookServer(
      {
        targetDir,
        run: async ({ baseUrl }) => baseUrl,
      },
      {
        getPort: async () => 6125,
        spawn,
        install,
        fetch: async () => ({ ok: true }),
        sleep: async () => {},
      },
    );

    expect(install).toHaveBeenCalledWith(
      "bun",
      ["install"],
      expect.objectContaining({ cwd: targetDir }),
    );
    expect(spawn).toHaveBeenCalledWith(
      "bun",
      ["run", "storybook", "--port", "6125", "--ci"],
      expect.objectContaining({ cwd: targetDir }),
    );
  });

  it("stops Storybook when the caller throws", async () => {
    const targetDir = createTarget();
    const process = fakeProcess();

    await expect(
      withStorybookServer(
        {
          targetDir,
          run: async () => {
            throw new Error("verification failed");
          },
        },
        {
          getPort: async () => 6124,
          install: async () => {},
          spawn: () => process,
          fetch: async () => ({ ok: true }),
          sleep: async () => {},
        },
      ),
    ).rejects.toThrow("verification failed");

    expect(process.killCalls).toEqual(["SIGTERM"]);
  });

  it("uses an injected base URL without spawning a server", async () => {
    const targetDir = createTarget();
    const spawn = vi.fn();

    const result = await withStorybookServer(
      {
        targetDir,
        baseUrl: "http://storybook.local/",
        run: async ({ baseUrl }) => baseUrl,
      },
      {
        spawn,
      },
    );

    expect(result).toBe("http://storybook.local");
    expect(spawn).not.toHaveBeenCalled();
  });
});

function createTarget(packageJson: Record<string, unknown> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "storybook-server-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: {}, ...packageJson }, null, 2));
  return dir;
}

function fakeProcess() {
  const emitter = new EventEmitter() as EventEmitter & {
    killCalls: string[];
    kill(signal?: NodeJS.Signals): boolean;
  };
  emitter.killCalls = [];
  emitter.kill = (signal = "SIGTERM") => {
    emitter.killCalls.push(signal);
    emitter.emit("exit", 0, signal);
    return true;
  };
  return emitter;
}
