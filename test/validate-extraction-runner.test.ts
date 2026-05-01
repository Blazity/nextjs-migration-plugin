import { describe, it, expect, vi } from "vitest";
import { runValidateExtraction } from "../lib/validate-extraction-runner.ts";

describe("runValidateExtraction", () => {
  it("calls execFile with the spec dirs and returns { passed: true } on exit 0", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: "PASS", stderr: "" });
    const result = await runValidateExtraction({
      specDirs: ["/x/pages/home/spec", "/x/pages/about/spec"],
      pluginRoot: "/plugin",
      execFile: exec,
    });
    expect(result.passed).toBe(true);
    expect(exec).toHaveBeenCalledOnce();
    const args = exec.mock.calls[0][1] as string[];
    expect(args).toContain("/x/pages/home/spec");
    expect(args).toContain("/x/pages/about/spec");
  });

  it("returns { passed: false, detail } on non-zero exit", async () => {
    const exec = vi.fn().mockRejectedValue(Object.assign(new Error("exit 1"), { stdout: "FAIL: duplicate", stderr: "" }));
    const result = await runValidateExtraction({
      specDirs: ["/x/pages/home/spec"],
      pluginRoot: "/plugin",
      execFile: exec,
    });
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/duplicate/);
  });
});
