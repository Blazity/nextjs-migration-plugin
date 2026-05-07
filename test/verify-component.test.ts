import { describe, expect, it, vi } from "vitest";
import { PNG } from "pngjs";
import { verifyComponent, type VerifyComponentPage } from "../lib/verify-component.ts";
import type { DiffResult } from "../scripts/lib/visual-verify-core.ts";

describe("verifyComponent", () => {
  it("passes every viewport whose Storybook render is within the 1% threshold", async () => {
    const page = fakePage();
    const result = await verifyComponent(
      {
        name: "Hero",
        references: [
          reference(390, "http://storybook/Hero?viewport=390"),
          reference(768, "http://storybook/Hero?viewport=768"),
          reference(1440, "http://storybook/Hero?viewport=1440"),
        ],
      },
      deps(page, [0, 0.004, 0.01]),
    );

    expect(result.status).toBe("PASS");
    expect(result.failingViewports).toEqual([]);
    expect(result.ratios).toEqual({ 390: 0, 768: 0.004, 1440: 0.01 });
    expect(page.calls).toEqual([
      ["setViewportSize", { width: 390, height: 900 }],
      ["goto", "http://storybook/Hero?viewport=390"],
      ["screenshot"],
      ["close"],
      ["setViewportSize", { width: 768, height: 900 }],
      ["goto", "http://storybook/Hero?viewport=768"],
      ["screenshot"],
      ["close"],
      ["setViewportSize", { width: 1440, height: 900 }],
      ["goto", "http://storybook/Hero?viewport=1440"],
      ["screenshot"],
      ["close"],
    ]);
  });

  it("fails viewports whose Storybook render exceeds the 1% threshold", async () => {
    const result = await verifyComponent(
      {
        name: "Hero",
        references: [
          reference(390, "http://storybook/Hero?viewport=390"),
          reference(768, "http://storybook/Hero?viewport=768"),
        ],
      },
      deps(fakePage(), [0.003, 0.02]),
    );

    expect(result.status).toBe("FAIL");
    expect(result.failingViewports).toEqual([768]);
    expect(result.results.map(viewport => viewport.status)).toEqual(["PASS", "FAIL"]);
  });
});

function reference(viewport: 390 | 768 | 1440, storyUrl: string) {
  return {
    viewport,
    referencePath: `/tmp/reference-${viewport}.png`,
    storyUrl,
  };
}

function deps(page: ReturnType<typeof fakePage>, ratios: number[]) {
  const png = new PNG({ width: 10, height: 10 });
  return {
    pageFactory: vi.fn(async () => page),
    readPng: vi.fn(() => png),
    decodePng: vi.fn(() => png),
    diffPngs: vi.fn(() => {
      const ratio = ratios.shift() ?? 0;
      return {
        width: 10,
        height: 10,
        mismatch: ratio * 100,
        ratio,
        diff: png,
      } satisfies DiffResult;
    }),
  };
}

function fakePage(): VerifyComponentPage & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    async setViewportSize(size) {
      calls.push(["setViewportSize", size]);
    },
    async goto(url) {
      calls.push(["goto", url]);
    },
    async screenshot() {
      calls.push(["screenshot"]);
      return Buffer.from("png");
    },
    async close() {
      calls.push(["close"]);
    },
  };
}
