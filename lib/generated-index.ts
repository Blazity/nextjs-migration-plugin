import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `generated/index.json` maps each `sectionInstanceId` (e.g. `p0-s3`) to a
 * filename in the same directory. The implementer reads this to find the
 * tsx/jsx source for a given section without relying on alphabetical
 * ordering of files (which silently broke when `generated/` ended up with
 * multiple naming schemes — see docs/issues/003).
 */
export type GeneratedIndex = Record<string, string>;

export function readGeneratedIndex(generatedDir: string): GeneratedIndex | null {
  const path = join(generatedDir, "index.json");
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const result: GeneratedIndex = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && value.length > 0) result[key] = value;
    }
    return result;
  } catch {
    return null;
  }
}

export function writeGeneratedIndex(generatedDir: string, index: GeneratedIndex): void {
  writeFileSync(join(generatedDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
}
