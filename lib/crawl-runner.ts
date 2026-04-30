import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const execFileP = promisify(execFile);

export interface RunCrawlArgs {
  sourceUrl: string;
  outputPath: string;
  maxPages?: number;
  maxDepth?: number;
  pluginRoot?: string;
}

export async function runCrawl(args: RunCrawlArgs): Promise<void> {
  const root = args.pluginRoot ?? defaultPluginRoot();
  const script = resolve(root, "scripts/crawl-site.ts");
  await execFileP("npx", [
    "tsx", script,
    "--source-url", args.sourceUrl,
    "--output", args.outputPath,
    "--max-pages", String(args.maxPages ?? 50),
    "--max-depth", String(args.maxDepth ?? 3),
  ], { env: process.env });
}

function defaultPluginRoot(): string {
  return resolve(fileURLToPath(new URL("..", import.meta.url)));
}
