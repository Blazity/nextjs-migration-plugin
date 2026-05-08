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
      deps(page, [0, 0.004, 0.01], undefined, [1, 0.996, 0.99]),
    );

    expect(result.status).toBe("PASS");
    expect(result.failingViewports).toEqual([]);
    expect(result.ratios).toEqual({ 390: 0, 768: 0.004, 1440: 0.01 });
    expect(result.results.map(viewport => viewport.similarity)).toEqual([1, 0.996, 0.99]);
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
          reference(1440, "http://storybook/Hero?viewport=1440"),
        ],
      },
      deps(fakePage(), [0.003, 0.02, 0.001], undefined, [0.997, 0.9, 0.999]),
    );

    expect(result.status).toBe("FAIL");
    expect(result.failingViewports).toEqual([768]);
    expect(result.results.map(viewport => viewport.status)).toEqual(["PASS", "FAIL", "PASS"]);
  });

  it("fails when any required viewport reference is missing", async () => {
    const result = await verifyComponent(
      {
        name: "Hero",
        references: [
          reference(390, "http://storybook/Hero?viewport=390"),
          reference(1440, "http://storybook/Hero?viewport=1440"),
        ],
      },
      deps(fakePage(), [0, 0], undefined, [1, 1]),
    );

    expect(result.status).toBe("FAIL");
    expect(result.failingViewports).toEqual([768]);
    expect(result.results.at(-1)).toEqual({
      viewport: 768,
      status: "FAIL",
      ratio: 1,
      similarity: 0,
      pixelDiffRatio: 1,
      bestOffset: { x: 0, y: 0 },
      referencePath: "",
      storyUrl: "",
      diagnostics: ["missing reference for viewport 768"],
    });
  });

  it("runs each viewport through the injected browser queue", async () => {
    const guard = queueGuard();
    const result = await verifyComponent(
      {
        name: "Hero",
        references: [
          reference(390, "http://storybook/Hero?viewport=390"),
          reference(768, "http://storybook/Hero?viewport=768"),
          reference(1440, "http://storybook/Hero?viewport=1440"),
        ],
      },
      deps(fakePage(guard.assertActive), [0, 0, 0], guard.queue, [1, 1, 1]),
    );

    expect(result.status).toBe("PASS");
    expect(guard.calls()).toBe(3);
  });

  it("passes a caller-supplied max diff ratio to the diff assessment", async () => {
    const assessDiff = vi.fn(() => ({
      status: "PASS" as const,
      ratio: 0.001,
      diagnostics: [],
    }));

    await verifyComponent(
      {
        name: "Hero",
        maxDiffRatio: 0.001,
        references: [
          reference(390, "http://storybook/Hero?viewport=390"),
          reference(768, "http://storybook/Hero?viewport=768"),
          reference(1440, "http://storybook/Hero?viewport=1440"),
        ],
      },
      {
        ...deps(fakePage(), [0.001, 0.001, 0.001], undefined, [0.999, 0.999, 0.999]),
        assessDiff,
      },
    );

    expect(assessDiff).toHaveBeenCalledWith(expect.objectContaining({
      maxDiffRatio: 0.001,
    }));
  });
});

function reference(viewport: 390 | 768 | 1440, storyUrl: string) {
  return {
    viewport,
    referencePath: `/tmp/reference-${viewport}.png`,
    storyUrl,
  };
}

function deps(
  page: ReturnType<typeof fakePage>,
  ratios: number[],
  browserQueue?: { enqueue<T>(run: () => Promise<T> | T): Promise<T> },
  similarities: number[] = ratios.map(ratio => 1 - ratio),
) {
  const png = new PNG({ width: 10, height: 10 });
  return {
    browserQueue,
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
    assessSimilarity: vi.fn(() => {
      const similarity = similarities.shift() ?? 1;
      return {
        similarity,
        pixelDiffRatio: 1 - similarity,
        bestOffset: { x: 0, y: 0 },
        diagnostics: [`similarity=${similarity}`],
      };
    }),
  };
}

function fakePage(assertActive: () => void = () => {}): VerifyComponentPage & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    async setViewportSize(size) {
      assertActive();
      calls.push(["setViewportSize", size]);
    },
    async goto(url) {
      assertActive();
      calls.push(["goto", url]);
    },
    async screenshot() {
      assertActive();
      calls.push(["screenshot"]);
      return Buffer.from("png");
    },
    async close() {
      assertActive();
      calls.push(["close"]);
    },
  };
}

function queueGuard() {
  let active = false;
  let calls = 0;
  return {
    queue: {
      async enqueue<T>(run: () => Promise<T> | T): Promise<T> {
        calls += 1;
        active = true;
        try {
          return await run();
        } finally {
          active = false;
        }
      },
    },
    assertActive() {
      if (!active) throw new Error("browser work ran outside BrowserWorkQueue");
    },
    calls() {
      return calls;
    },
  };
}
