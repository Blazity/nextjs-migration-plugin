import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { QueueConfigSchema, type QueueConfig } from "../schemas/queue-config.ts";
import { migrationPaths } from "./migration-paths.ts";

const DEFAULT_QUEUE_CONFIG: QueueConfig = { concurrency: 1 };

export function loadQueueConfig(targetDir: string): QueueConfig {
  const path = migrationPaths(targetDir).queueConfig;
  if (!existsSync(path)) return DEFAULT_QUEUE_CONFIG;
  return QueueConfigSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function setQueueConcurrency(targetDir: string, concurrency: number): QueueConfig {
  const config = parseQueueConfig({ concurrency });
  const path = migrationPaths(targetDir).queueConfig;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

export function parseQueueConfig(value: unknown): QueueConfig {
  const result = QueueConfigSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Browser work concurrency must be between 1 and 4");
  }
  return result.data;
}
