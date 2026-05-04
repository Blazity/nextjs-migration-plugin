import { describe, it, expect, vi } from "vitest";
import { runJsxGeneration } from "../lib/jsx-generator-runner.ts";

describe("runJsxGeneration", () => {
  it("invokes the configured execFile with --specs-dir and --output-dir", async () => {
    const calls: { cmd: string; args: string[] }[] = [];
    const fakeExec = vi.fn(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return { stdout: "ok", stderr: "" };
    });
    await runJsxGeneration(
      { specsDir: "/spec", outputDir: "/out", pluginRoot: "/plugin" },
      { execFile: fakeExec },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0]).toBe("tsx");
    expect(calls[0].args.slice(-2)).toEqual(["/spec", "/out"]);
  });

  it("captures the wall-clock time and propagates stderr on subprocess failure", async () => {
    const fakeExec = vi.fn(async () => {
      throw new Error("subprocess died");
    });
    await expect(
      runJsxGeneration({ specsDir: "/spec", outputDir: "/out", pluginRoot: "/plugin" }, { execFile: fakeExec }),
    ).rejects.toThrow(/subprocess died/);
  });
});
