import { execFile } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileP = promisify(execFile);
const recoveryEntrypoints = [
  "lib/discover.ts",
  "lib/analyze.ts",
  "lib/plan.ts",
  "lib/extract.ts",
  "lib/build.ts",
  "lib/polish.ts",
];

describe("recovery entry points", () => {
  it.each(recoveryEntrypoints)("%s is labeled recovery-only and keeps a CLI entry", (path) => {
    const content = readFileSync(join(process.cwd(), path), "utf8");

    expect(content).toContain("RECOVERY USE ONLY");
    expect(content).toContain("if (import.meta.url === `file://${process.argv[1]}`)");
  });

  it("does not expose recovery entry points through command wrappers", () => {
    const commandFiles = readdirSync(join(process.cwd(), "commands"))
      .map(fileName => readFileSync(join(process.cwd(), "commands", fileName), "utf8"))
      .join("\n");

    for (const phase of ["discover", "analyze", "plan", "extract", "build", "polish"]) {
      expect(commandFiles).not.toContain(`migrate:${phase}`);
      expect(commandFiles).not.toContain(`migrate-${phase}`);
    }
  });

  it.each(recoveryEntrypoints)("%s exits non-zero without required target args", async (path) => {
    let error: (Error & { code?: number; stderr?: string }) | undefined;

    try {
      await execFileP("pnpm", ["exec", "tsx", path], {
        cwd: process.cwd(),
        timeout: 10_000,
      });
    } catch (err) {
      error = err as Error & { code?: number; stderr?: string };
    }

    expect(error?.code).toBe(2);
    expect(error?.stderr).toContain("Recovery entry point requires --target <dir>");
  }, 20_000);
});
