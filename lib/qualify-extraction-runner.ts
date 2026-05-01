import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const execFileP = promisify(execFile);

export interface QualifyPage {
  url: string;
  specDir: string;
}

export interface RunQualifyExtractionArgs {
  pages: QualifyPage[];
  adapterPath: string;
  pluginRoot?: string;
  execFile?: (cmd: string, args: string[], opts?: object) => Promise<{ stdout: string; stderr: string }>;
}

export interface QualifyResult {
  passed: boolean;
  failures: { url: string; detail: string }[];
}

export async function runQualifyExtraction(args: RunQualifyExtractionArgs): Promise<QualifyResult> {
  const root = args.pluginRoot ?? defaultPluginRoot();
  const script = resolve(root, "scripts/qualify-extraction.ts");
  const exec = args.execFile ?? execFileP;
  const failures: QualifyResult["failures"] = [];
  for (const page of args.pages) {
    try {
      await exec("npx", ["tsx", script, page.url, page.specDir, "--adapter", args.adapterPath], { env: process.env });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      failures.push({
        url: page.url,
        detail: (e.stdout || e.stderr || e.message || "qualify-extraction failed").slice(0, 500),
      });
    }
  }
  return { passed: failures.length === 0, failures };
}

function defaultPluginRoot(): string {
  return resolve(fileURLToPath(new URL("..", import.meta.url)));
}
