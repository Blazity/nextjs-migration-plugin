import { loadQueueConfig } from "./queue-config.ts";

export interface BrowserWorkQueueArgs {
  concurrency?: number;
}

export interface BrowserWorkQueueLike {
  enqueue<T>(run: () => Promise<T> | T): Promise<T>;
}

type Job<T> = {
  run: () => Promise<T> | T;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

export class BrowserWorkQueue {
  #concurrency: number;
  #active = 0;
  #queue: Job<unknown>[] = [];

  constructor(args: BrowserWorkQueueArgs = {}) {
    this.#concurrency = validateConcurrency(args.concurrency ?? 1);
  }

  static from(args: { targetDir: string }): BrowserWorkQueue {
    return new BrowserWorkQueue(loadQueueConfig(args.targetDir));
  }

  get concurrency(): number {
    return this.#concurrency;
  }

  setConcurrency(concurrency: number): void {
    this.#concurrency = validateConcurrency(concurrency);
    this.#drain();
  }

  enqueue<T>(run: () => Promise<T> | T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.#queue.push({ run, resolve, reject } as Job<unknown>);
      this.#drain();
    });
  }

  #drain(): void {
    while (this.#active < this.#concurrency && this.#queue.length > 0) {
      const job = this.#queue.shift();
      if (!job) return;
      this.#active += 1;
      Promise.resolve()
        .then(job.run)
        .then(job.resolve, job.reject)
        .finally(() => {
          this.#active -= 1;
          this.#drain();
        });
    }
  }
}

function validateConcurrency(concurrency: number): number {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) {
    throw new Error("Browser work concurrency must be between 1 and 4");
  }
  return concurrency;
}
