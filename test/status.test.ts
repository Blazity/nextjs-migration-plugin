import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { getStatus } from "../lib/status.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";
import { hashArtifact } from "../lib/artifact-hash.ts";
import { migrationPaths } from "../lib/migration-paths.ts";
import { setQueueConcurrency } from "../lib/queue-config.ts";
import type { ApprovedInventory } from "../schemas/approved-inventory.ts";
import type { DraftInventory } from "../schemas/draft-inventory.ts";

const baseSite = {
  sourceUrl: "https://example.com",
  target: "./",
  inputMode: "url-only" as const,
  maxParallelPages: 4,
  maxParallelSections: 4,
};

describe("getStatus", () => {
  it("returns { initialized: false } when .migration/ does not exist", async () => {
    const target = mkdtempSync(join(tmpdir(), "status-"));
    const status = await getStatus(target);
    expect(status.initialized).toBe(false);
  });

  it("returns guided-flow status after bootstrap without mode or goal", async () => {
    const target = mkdtempSync(join(tmpdir(), "status-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    const status = await getStatus(target);
    expect(status).toEqual({
      initialized: true,
      sourceUrl: "https://example.com",
      inputMode: "url-only",
      draftInventory: null,
      approvals: {
        inventory: "draft",
        components: [],
        pages: [],
      },
      queueConcurrency: 1,
    });
    expect(JSON.stringify(status)).not.toContain("mode");
    expect(JSON.stringify(status)).not.toContain("goal");
  });

  it("does not document Mode or Goal in the status summary", () => {
    const skill = readFileSync(join(process.cwd(), "skills/migrate-status/SKILL.md"), "utf8");
    expect(skill).not.toContain("Mode:");
    expect(skill).not.toContain("Goal:");
    expect(skill).not.toContain("[mode]");
    expect(skill).not.toContain("[goal]");
    expect(skill).not.toContain("Completed phases");
    expect(skill).toContain("Browser queue concurrency");
  });

  it("summarises draft inventory, component approvals, page approvals, and queue concurrency", async () => {
    const target = mkdtempSync(join(tmpdir(), "status-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    const paths = migrationPaths(target);
    const draft = draftInventory();
    const approved = approvedInventory(draft);
    writeJson(paths.draftInventory, draft);
    writeJson(paths.approvedInventory, approved);
    writeJson(paths.componentApproval("group-header"), componentApproval("group-header", "SiteHeader", approved.artifactVersion));
    writeJson(paths.componentApproval("group-hero"), {
      ...componentApproval("group-hero", "Hero", approved.artifactVersion),
      staleSince: "2026-05-07T13:00:00.000Z",
    });
    writeJson(paths.pageApproval("home"), {
      kind: "page-layout",
      approvedAt: "2026-05-07T12:30:00.000Z",
      artifactVersion: approved.artifactVersion,
      slug: "home",
      componentGroupIds: ["group-header", "group-hero"],
      pageReferenceVersion: "1234567890abcdef",
    });
    setQueueConcurrency(target, 2);

    const status = await getStatus(target);

    expect(status).toEqual({
      initialized: true,
      sourceUrl: "https://example.com",
      inputMode: "url-only",
      draftInventory: {
        revision: 1,
        hash: hashArtifact(draft),
        blockingNames: [],
      },
      approvals: {
        inventory: "approved",
        components: [
          {
            componentGroupId: "group-header",
            implementationName: "SiteHeader",
            status: "approved",
          },
          {
            componentGroupId: "group-hero",
            implementationName: "Hero",
            status: "stale",
          },
        ],
        pages: [{
          slug: "home",
          componentGroupIds: ["group-header", "group-hero"],
          status: "stale",
        }],
      },
      queueConcurrency: 2,
    });
  });
});

function draftInventory(): DraftInventory {
  return {
    generatedAt: "2026-05-07T12:00:00.000Z",
    revision: 1,
    entries: [
      {
        componentGroupId: "group-header",
        proposedName: "SiteHeader",
        kind: "shell",
        sectionInstanceIds: ["p0-s0"],
      },
      {
        componentGroupId: "group-hero",
        proposedName: "Hero",
        kind: "content",
        sectionInstanceIds: ["p0-s1"],
      },
    ],
  };
}

function approvedInventory(draft: DraftInventory): ApprovedInventory {
  return {
    approvedAt: "2026-05-07T12:15:00.000Z",
    artifactVersion: hashArtifact(draft),
    entries: draft.entries.map(entry => ({
      ...entry,
      implementationName: entry.proposedName,
      filePath: `src/components/${entry.proposedName}.tsx`,
    })),
  };
}

function componentApproval(componentGroupId: string, implementationName: string, artifactVersion: string) {
  return {
    kind: "component-batch",
    approvedAt: "2026-05-07T12:30:00.000Z",
    artifactVersion,
    componentGroupIds: [componentGroupId],
    implementationNames: [implementationName],
  };
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "w" });
}
