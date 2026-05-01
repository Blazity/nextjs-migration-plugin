import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const execFileP = promisify(execFile);

export interface RunValidateExtractionArgs {
  specDirs: string[];
  pluginRoot?: string;
  execFile?: (cmd: string, args: string[], opts?: object) => Promise<{ stdout: string; stderr: string }>;
}

export interface RunResult {
  passed: boolean;
  detail?: string;
}

export async function runValidateExtraction(args: RunValidateExtractionArgs): Promise<RunResult> {
  const root = args.pluginRoot ?? defaultPluginRoot();
  const script = resolve(root, "scripts/validate-extraction.ts");
  const exec = args.execFile ?? execFileP;
  try {
    await exec("npx", ["tsx", script, ...args.specDirs], { env: process.env });
    return { passed: true };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { passed: false, detail: (e.stdout || e.stderr || e.message || "validate-extraction failed").slice(0, 500) };
  }
}

function defaultPluginRoot(): string {
  return resolve(fileURLToPath(new URL("..", import.meta.url)));
}
