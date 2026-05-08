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
        fetch,
        sleep: async () => {},
      },
    );

    expect(result).toBe("ran:http://127.0.0.1:6123");
    expect(spawn).toHaveBeenCalledWith(
      "pnpm",
      ["exec", "storybook", "dev", "--port", "6123", "--ci"],
      expect.objectContaining({ cwd: targetDir }),
    );
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:6123/iframe.html");
    expect(process.killCalls).toEqual(["SIGTERM"]);
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

function createTarget(): string {
  const dir = mkdtempSync(join(tmpdir(), "storybook-server-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: {} }, null, 2));
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
