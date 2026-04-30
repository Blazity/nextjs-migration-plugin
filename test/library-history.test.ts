import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendLibraryHistory } from "../lib/library-history.ts";

function tempLibraryDir(): string {
  const root = mkdtempSync(join(tmpdir(), "library-history-"));
  const lib = join(root, "library");
  mkdirSync(lib, { recursive: true });
  return lib;
}

describe("appendLibraryHistory", () => {
  it("creates HISTORY.md with a header on first call", async () => {
    const dir = tempLibraryDir();
    await appendLibraryHistory(dir, {
      runDir: "001-initial",
      summary: "Initial Phase 2 — 12 components, 47 routes, 0 unique sections.",
    });
    const contents = readFileSync(join(dir, "HISTORY.md"), "utf8");
    expect(contents).toMatch(/^# Library history/);
    expect(contents).toContain("001-initial");
    expect(contents).toContain("12 components");
  });

  it("appends a new entry on subsequent calls without rewriting older entries", async () => {
    const dir = tempLibraryDir();
    await appendLibraryHistory(dir, { runDir: "001-initial", summary: "first entry" });
    await appendLibraryHistory(dir, { runDir: "002-add-blog", summary: "second entry" });
    const contents = readFileSync(join(dir, "HISTORY.md"), "utf8");
    expect(contents.indexOf("first entry")).toBeLessThan(contents.indexOf("second entry"));
    expect(contents.match(/## /g)?.length).toBe(2);
  });

  it("includes an ISO timestamp on each entry", async () => {
    const dir = tempLibraryDir();
    await appendLibraryHistory(dir, { runDir: "001-initial", summary: "x" });
    const contents = readFileSync(join(dir, "HISTORY.md"), "utf8");
    expect(contents).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
