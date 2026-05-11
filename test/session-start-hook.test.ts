import { afterEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const hookPath = pathToFileURL(resolve("hooks/session-start.js")).href;

async function importHook(caseName: string) {
  return import(`${hookPath}?case=${caseName}`);
}

describe("SessionStart hook plugin detection", () => {
  afterEach(() => {
    vi.doUnmock("node:child_process");
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("accepts enabled plugins reported by Claude CLI id", async () => {
    const execSync = vi.fn(() => JSON.stringify([
      { id: "superpowers@claude-plugins-official", enabled: true },
    ]));
    vi.doMock("node:child_process", () => ({ execSync }));
    const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit:${code}`);
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(importHook("enabled-id")).resolves.toBeDefined();

    expect(execSync).toHaveBeenCalledWith("claude plugin list --json", { encoding: "utf8" });
    expect(exit).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("treats disabled required plugins as missing", async () => {
    vi.doMock("node:child_process", () => ({
      execSync: vi.fn(() => JSON.stringify([
        { id: "superpowers@claude-plugins-official", enabled: false },
      ])),
    }));
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit:${code}`);
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(importHook("disabled-id")).rejects.toThrow("process.exit:1");

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("[nextjs-migration-plugin] Missing required plugins: 'superpowers'.")
    );
  });
});
