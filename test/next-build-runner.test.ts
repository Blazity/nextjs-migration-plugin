import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runNextBuild, detectPackageManager } from "../lib/next-build-runner.ts";
import { runScriptCommand } from "../lib/package-manager.ts";

describe("detectPackageManager", () => {
  it("uses the packageManager field before lockfiles", () => {
    const dir = mkdtempSync(join(tmpdir(), "pm-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ packageManager: "bun@1.3.0" }));
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    expect(detectPackageManager(dir)).toBe("bun");
  });

  it("returns pnpm when pnpm-lock.yaml exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "pm-"));
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    expect(detectPackageManager(dir)).toBe("pnpm");
  });
  it("returns yarn when yarn.lock exists and no pnpm lock", () => {
    const dir = mkdtempSync(join(tmpdir(), "pm-"));
    writeFileSync(join(dir, "yarn.lock"), "");
    expect(detectPackageManager(dir)).toBe("yarn");
  });
  it("returns bun when bun.lock exists and no pnpm/yarn lock", () => {
    const dir = mkdtempSync(join(tmpdir(), "pm-"));
    writeFileSync(join(dir, "bun.lock"), "");
    expect(detectPackageManager(dir)).toBe("bun");
  });
  it("falls back to npm when no lockfile is present", () => {
    const dir = mkdtempSync(join(tmpdir(), "pm-"));
    expect(detectPackageManager(dir)).toBe("npm");
  });
});

describe("runScriptCommand", () => {
  it("passes pnpm script args directly without an npm separator", () => {
    expect(runScriptCommand("pnpm", "storybook", ["--port", "6123"])).toEqual({
      command: "pnpm",
      args: ["run", "storybook", "--port", "6123"],
    });
  });

  it("keeps npm's script arg separator", () => {
    expect(runScriptCommand("npm", "storybook", ["--port", "6123"])).toEqual({
      command: "npm",
      args: ["run", "storybook", "--", "--port", "6123"],
    });
  });
});

describe("runNextBuild", () => {
  it("invokes the configured execFile with the detected package manager and returns exitCode 0 on success", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nb-"));
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    const calls: { cmd: string; args: string[] }[] = [];
    const fakeExec = vi.fn(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return { stdout: "", stderr: "" };
    });
    const result = await runNextBuild({ targetDir: dir }, { execFile: fakeExec });
    expect(result.exitCode).toBe(0);
    expect(calls[0].cmd).toBe("pnpm");
    expect(calls[0].args).toContain("build");
  });

  it("runs Bun build scripts with bun run", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nb-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ packageManager: "bun@1.3.0" }));
    const fakeExec = vi.fn(async () => ({ stdout: "", stderr: "" }));

    const result = await runNextBuild({ targetDir: dir }, { execFile: fakeExec });

    expect(result).toMatchObject({ exitCode: 0, packageManager: "bun" });
    expect(fakeExec).toHaveBeenCalledWith(
      "bun",
      ["run", "build"],
      expect.objectContaining({ cwd: dir }),
    );
  });

  it("returns exitCode 1 with stderr when the subprocess throws", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nb-"));
    const fakeExec = vi.fn(async () => {
      const err = new Error("build failed") as Error & { stderr?: string };
      err.stderr = "type error in foo.tsx";
      throw err;
    });
    const result = await runNextBuild({ targetDir: dir }, { execFile: fakeExec });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("type error");
  });
});
