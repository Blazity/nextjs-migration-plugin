import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("recovery suite gating", () => {
  it("gates legacy dispatcher tests behind RECOVERY_TESTS", () => {
    const testFile = readFileSync(join(process.cwd(), "test/recovery/continue-legacy.test.ts"), "utf8");

    expect(testFile).toContain("RECOVERY_TESTS");
    expect(testFile).toContain("describe.skip");
  });

  it("documents how to run recovery tests", () => {
    const doc = readFileSync(join(process.cwd(), "docs/recovery/README.md"), "utf8");

    expect(doc).toContain("RECOVERY_TESTS=1");
    expect(doc).toContain("test/recovery");
  });
});
