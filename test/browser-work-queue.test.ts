import { describe, expect, it } from "vitest";
import { BrowserWorkQueue } from "../lib/browser-work-queue.ts";

describe("BrowserWorkQueue", () => {
  it("runs jobs sequentially when concurrency is 1", async () => {
    const queue = new BrowserWorkQueue({ concurrency: 1 });
    let active = 0;
    let peak = 0;

    await Promise.all([
      queue.enqueue(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await delay(5);
        active -= 1;
      }),
      queue.enqueue(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await delay(5);
        active -= 1;
      }),
    ]);

    expect(peak).toBe(1);
  });

  it("allows overlap when concurrency is 2", async () => {
    const queue = new BrowserWorkQueue({ concurrency: 2 });
    let active = 0;
    let peak = 0;

    await Promise.all([
      queue.enqueue(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await delay(5);
        active -= 1;
      }),
      queue.enqueue(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await delay(5);
        active -= 1;
      }),
    ]);

    expect(peak).toBe(2);
  });

  it("propagates job errors and continues later jobs", async () => {
    const queue = new BrowserWorkQueue({ concurrency: 1 });
    const failed = queue.enqueue(async () => {
      throw new Error("boom");
    });
    const recovered = queue.enqueue(async () => "ok");

    await expect(failed).rejects.toThrow("boom");
    await expect(recovered).resolves.toBe("ok");
  });

  it("rejects concurrency outside 1 to 4", () => {
    const queue = new BrowserWorkQueue({ concurrency: 1 });

    expect(() => queue.setConcurrency(0)).toThrow("Browser work concurrency must be between 1 and 4");
    expect(() => queue.setConcurrency(5)).toThrow("Browser work concurrency must be between 1 and 4");
    queue.setConcurrency(4);
    expect(queue.concurrency).toBe(4);
  });
});

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
