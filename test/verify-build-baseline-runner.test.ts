import { describe, it, expect, vi } from "vitest";
import { runVerifyBuildBaseline } from "../lib/verify-build-baseline-runner.ts";

describe("runVerifyBuildBaseline", () => {
  it("invokes the vendored script with referenceUrl, localUrl, specsDir and the adapter flag", async () => {
    const calls: string[][] = [];
    const fakeExec = vi.fn(async (_cmd: string, args: string[]) => {
      calls.push(args);
      return { stdout: "PASS", stderr: "" };
    });
    const result = await runVerifyBuildBaseline(
      {
        referenceUrl: "https://example.com/",
        localUrl: "http://localhost:3000/",
        specsDir: "/spec",
        adapterPath: "/a/webflow.json",
        pluginRoot: "/plugin",
      },
      { execFile: fakeExec },
    );
    expect(result.passed).toBe(true);
    expect(calls[0]).toContain("https://example.com/");
    expect(calls[0]).toContain("http://localhost:3000/");
    expect(calls[0]).toContain("/spec");
    expect(calls[0]).toContain("--adapter");
    expect(calls[0]).toContain("/a/webflow.json");
  });

  it("returns passed=false with detail on subprocess failure", async () => {
    const fakeExec = vi.fn(async () => {
      const err = new Error("baseline mismatch") as Error & { stderr?: string };
      err.stderr = "section 03 missing";
      throw err;
    });
    const result = await runVerifyBuildBaseline(
      {
        referenceUrl: "https://example.com/",
        localUrl: "http://localhost:3000/",
        specsDir: "/spec",
        adapterPath: "/a/webflow.json",
        pluginRoot: "/plugin",
      },
      { execFile: fakeExec },
    );
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("section 03 missing");
  });
});
