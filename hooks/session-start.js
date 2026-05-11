#!/usr/bin/env node
import { execSync } from "node:child_process";

const REQUIRED = ["superpowers"];

function listInstalledPlugins() {
  try {
    const output = execSync("claude plugin list --json", { encoding: "utf8" });
    const parsed = JSON.parse(output);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(p => p.enabled !== false)
      .map(p => (p.id ?? p.name ?? "").split("@")[0])
      .filter(Boolean);
  } catch {
    return [];
  }
}

const installed = listInstalledPlugins();
const missing = REQUIRED.filter(r => !installed.includes(r));

if (missing.length > 0) {
  const list = missing.map(m => `'${m}'`).join(", ");
  console.error(
    `[nextjs-migration-plugin] Missing required plugins: ${list}. ` +
    `Run: claude plugin install ${missing.join(" ")}`
  );
  process.exit(1);
}
