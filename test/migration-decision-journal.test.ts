import { describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordMigrationDecision } from "../lib/migration-decision-journal.ts";
import { migrationPaths } from "../lib/migration-paths.ts";

describe("recordMigrationDecision", () => {
  it("keeps repeated decisions append-only even with identical timestamps and summaries", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "decision-journal-"));
    const createdAt = "2026-05-08T12:00:00.000Z";

    recordMigrationDecision({
      targetDir,
      kind: "component-inventory-approval",
      actor: "user",
      createdAt,
      summary: "Approved Component Inventory Review",
      artifactVersion: "0123456789abcdef",
    });
    recordMigrationDecision({
      targetDir,
      kind: "component-inventory-approval",
      actor: "user",
      createdAt,
      summary: "Approved Component Inventory Review",
      artifactVersion: "0123456789abcdef",
    });

    expect(readdirSync(migrationPaths(targetDir).decisionsDir).sort()).toHaveLength(2);
  });
});
