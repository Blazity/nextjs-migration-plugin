import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const execFileP = promisify(execFile);

export interface RunDiscoverSectionsArgs {
  urls: string[];
  primarySelector: string;
  outputPath: string;
  pluginRoot?: string;
}

export async function runDiscoverSections(args: RunDiscoverSectionsArgs): Promise<void> {
  const root = args.pluginRoot ?? defaultPluginRoot();
  const script = resolve(root, "scripts/discover-sections.ts");
  await execFileP("npx", [
    "tsx", script,
    "--urls", args.urls.join(","),
    "--selector", args.primarySelector,
    "--output", args.outputPath,
  ], { env: process.env });
}

function defaultPluginRoot(): string {
  return resolve(fileURLToPath(new URL("..", import.meta.url)));
}
