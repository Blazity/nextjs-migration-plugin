import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface LibraryHistoryEntry {
  runDir: string;
  summary: string;
}

export async function appendLibraryHistory(
  libraryDir: string,
  entry: LibraryHistoryEntry,
): Promise<void> {
  const path = join(libraryDir, "HISTORY.md");
  if (!existsSync(path)) {
    writeFileSync(path, `# Library history\n\nAppend-only changelog of library mutations across runs.\n\n`);
  }
  const stamped = `## ${new Date().toISOString()} — ${entry.runDir}\n\n${entry.summary}\n\n`;
  appendFileSync(path, stamped);
}
