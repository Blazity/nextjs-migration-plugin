import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkProjectScaffold } from "../lib/project-scaffold.ts";

const scaffoldFixture = fileURLToPath(new URL("./fixtures/target-scaffold/", import.meta.url));

describe("checkProjectScaffold", () => {
  it("passes when package.json + src/app/layout.tsx exist", () => {
    const result = checkProjectScaffold(scaffoldFixture);
    expect(result.ok).toBe(true);
  });

  it("fails when package.json is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "scaffold-"));
    mkdirSync(join(dir, "src/app"), { recursive: true });
    writeFileSync(join(dir, "src/app/layout.tsx"), "");
    const result = checkProjectScaffold(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toContain("package.json");
  });

  it("fails when src/app/layout.tsx is missing AND layouts.json is empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "scaffold-"));
    writeFileSync(join(dir, "package.json"), "{}");
    const result = checkProjectScaffold(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toContain("src/app/layout.tsx");
  });
});
