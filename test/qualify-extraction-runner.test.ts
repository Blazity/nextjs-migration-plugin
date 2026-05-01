import { describe, it, expect, vi } from "vitest";
import { runQualifyExtraction } from "../lib/qualify-extraction-runner.ts";

describe("runQualifyExtraction", () => {
  it("invokes once per page and aggregates results", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: "PASS", stderr: "" });
    const result = await runQualifyExtraction({
      pages: [
        { url: "https://example.com/", specDir: "/x/pages/home/spec" },
        { url: "https://example.com/about", specDir: "/x/pages/about/spec" },
      ],
      adapterPath: "/some/adapter.json",
      pluginRoot: "/plugin",
      execFile: exec,
    });
    expect(result.passed).toBe(true);
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it("returns { passed: false, failures } when any page fails", async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce({ stdout: "PASS", stderr: "" })
      .mockRejectedValueOnce(Object.assign(new Error("exit 1"), { stdout: "section count mismatch", stderr: "" }));
    const result = await runQualifyExtraction({
      pages: [
        { url: "https://example.com/", specDir: "/x/pages/home/spec" },
        { url: "https://example.com/about", specDir: "/x/pages/about/spec" },
      ],
      adapterPath: "/some/adapter.json",
      pluginRoot: "/plugin",
      execFile: exec,
    });
    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].url).toBe("https://example.com/about");
    expect(result.failures[0].detail).toMatch(/section count/);
  });
});
