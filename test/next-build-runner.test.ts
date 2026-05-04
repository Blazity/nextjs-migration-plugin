import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runNextBuild, detectPackageManager } from "../lib/next-build-runner.ts";

describe("detectPackageManager", () => {
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
  it("falls back to npm when no lockfile is present", () => {
    const dir = mkdtempSync(join(tmpdir(), "pm-"));
    expect(detectPackageManager(dir)).toBe("npm");
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
