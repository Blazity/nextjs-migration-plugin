import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const execFileP = promisify(execFile);

export interface RunDiscoverSectionsArgs {
  urls: string[];
  primarySelector: string;
  outputPath: string;
  skipSelectors?: string[];
  pluginRoot?: string;
}

export async function runDiscoverSections(args: RunDiscoverSectionsArgs): Promise<void> {
  const root = args.pluginRoot ?? defaultPluginRoot();
  const script = resolve(root, "scripts/discover-sections.ts");
  const argv = [
    "tsx", script,
    "--urls", args.urls.join(","),
    "--selector", args.primarySelector,
    "--output", args.outputPath,
  ];
  if (args.skipSelectors && args.skipSelectors.length > 0) {
    argv.push("--skip-selectors", args.skipSelectors.join(","));
  }
  await execFileP("npx", argv, { env: process.env });
}

function defaultPluginRoot(): string {
  return resolve(fileURLToPath(new URL("..", import.meta.url)));
}
