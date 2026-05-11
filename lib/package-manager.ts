import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type PackageManager = "pnpm" | "yarn" | "npm" | "bun";

const packageManagers = new Set<PackageManager>(["pnpm", "yarn", "npm", "bun"]);

export interface PackageCommand {
  command: PackageManager;
  args: string[];
}

export function detectPackageManager(targetDir: string): PackageManager {
  const declared = readDeclaredPackageManager(targetDir);
  if (declared) return declared;

  if (existsSync(join(targetDir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(targetDir, "yarn.lock"))) return "yarn";
  if (
    existsSync(join(targetDir, "bun.lock")) ||
    existsSync(join(targetDir, "bun.lockb"))
  ) return "bun";
  return "npm";
}

export function installCommand(packageManager: PackageManager): PackageCommand {
  return {
    command: packageManager,
    args: ["install"],
  };
}

export function runScriptCommand(
  packageManager: PackageManager,
  scriptName: string,
  scriptArgs: string[] = [],
): PackageCommand {
  if (packageManager === "pnpm" || packageManager === "yarn" || packageManager === "bun") {
    return {
      command: packageManager,
      args: ["run", scriptName, ...scriptArgs],
    };
  }

  return {
    command: packageManager,
    args: scriptArgs.length > 0
      ? ["run", scriptName, "--", ...scriptArgs]
      : ["run", scriptName],
  };
}

function readDeclaredPackageManager(targetDir: string): PackageManager | undefined {
  const packageJsonPath = join(targetDir, "package.json");
  if (!existsSync(packageJsonPath)) return undefined;

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      packageManager?: unknown;
    };
    if (typeof packageJson.packageManager !== "string") return undefined;

    const [name] = packageJson.packageManager.split("@");
    return packageManagers.has(name as PackageManager)
      ? name as PackageManager
      : undefined;
  } catch {
    return undefined;
  }
}
