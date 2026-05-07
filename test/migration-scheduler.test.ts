import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { hashArtifact } from "../lib/artifact-hash.ts";
import { migrationPaths } from "../lib/migration-paths.ts";
import { scheduleMigration } from "../lib/migration-scheduler.ts";
import type { ApprovedInventory } from "../schemas/approved-inventory.ts";
import type { DraftInventory } from "../schemas/draft-inventory.ts";
import type { RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";

const now = "2026-05-07T12:00:00.000Z";

describe("scheduleMigration", () => {
  it("returns review-inventory for a fresh migration with only draft inventory", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "scheduler-"));
    const draft = draftInventory();
    writeJson(migrationPaths(targetDir).draftInventory, draft);

    const result = scheduleMigration(targetDir);

    expect(result).toEqual({
      next: "review-inventory",
      artifactVersion: hashArtifact(draft),
      reviewHtmlPath: migrationPaths(targetDir).reviewHtml,
    });
  });

  it("selects the next component batch by shell components, reuse, then inventory order", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "scheduler-"));
    const draft = draftInventory([
      entry("group-card", "PricingCard", "content", ["p0-s2"]),
      entry("group-hero", "Hero", "content", ["p0-s1", "p1-s1", "p2-s1"]),
      entry("group-footer", "SiteFooter", "shell", ["p0-s4"]),
      entry("group-header", "SiteHeader", "shell", ["p0-s0", "p1-s0"]),
    ]);
    const approved = approvedInventory(draft);
    const paths = migrationPaths(targetDir);
    writeJson(paths.draftInventory, draft);
    writeJson(paths.approvedInventory, approved);

    const result = scheduleMigration(targetDir);

    expect(result.next).toBe("implement-component-batch");
    if (result.next === "implement-component-batch") {
      expect(result.batch.map(component => component.componentGroupId)).toEqual([
        "group-header",
        "group-footer",
        "group-hero",
      ]);
    }
  });

  it("returns assemble-page after every component is approved and page layout is pending", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "scheduler-"));
    const draft = draftInventory();
    const approved = approvedInventory(draft);
    const paths = migrationPaths(targetDir);
    writeJson(paths.draftInventory, draft);
    writeJson(paths.approvedInventory, approved);
    writeJson(paths.rawDiscovery, rawDiscovery());
    for (const component of approved.entries) {
      writeComponentApproval(targetDir, component.componentGroupId, component.implementationName, {
        artifactVersion: approved.artifactVersion,
      });
    }

    const result = scheduleMigration(targetDir);

    expect(result).toEqual({
      next: "assemble-page",
      slug: "home",
      componentGroupIds: ["group-header", "group-hero"],
    });
  });

  it("returns all-done after component and page approvals are complete", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "scheduler-"));
    const draft = draftInventory();
    const approved = approvedInventory(draft);
    const paths = migrationPaths(targetDir);
    writeJson(paths.draftInventory, draft);
    writeJson(paths.approvedInventory, approved);
    writeJson(paths.rawDiscovery, rawDiscovery());
    for (const component of approved.entries) {
      writeComponentApproval(targetDir, component.componentGroupId, component.implementationName, {
        artifactVersion: approved.artifactVersion,
      });
    }
    writeJson(paths.pageApproval("home"), {
      kind: "page-layout",
      approvedAt: now,
      artifactVersion: "abcdefabcdef1234",
      slug: "home",
      componentGroupIds: ["group-header", "group-hero"],
      pageReferenceVersion: "1234567890abcdef",
    });

    const result = scheduleMigration(targetDir);

    expect(result).toEqual({ next: "all-done" });
  });

  it("returns review-inventory when the approved inventory artifact version no longer matches the draft", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "scheduler-"));
    const previousDraft = draftInventory();
    const currentDraft = {
      ...previousDraft,
      revision: 2,
      entries: [
        {
          ...previousDraft.entries[0],
          proposedName: "GlobalHeader",
        },
        previousDraft.entries[1],
      ],
    };
    const paths = migrationPaths(targetDir);
    writeJson(paths.draftInventory, currentDraft);
    writeJson(paths.approvedInventory, approvedInventory(previousDraft));

    const result = scheduleMigration(targetDir);

    expect(result).toEqual({
      next: "review-inventory",
      artifactVersion: hashArtifact(currentDraft),
      reviewHtmlPath: paths.reviewHtml,
      staleApproval: {
        approval: "component-inventory",
      },
    });
  });

  it("treats component approvals for an older inventory artifact as missing", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "scheduler-"));
    const draft = draftInventory();
    const approved = approvedInventory(draft);
    const paths = migrationPaths(targetDir);
    writeJson(paths.draftInventory, draft);
    writeJson(paths.approvedInventory, approved);
    for (const component of approved.entries) {
      writeComponentApproval(targetDir, component.componentGroupId, component.implementationName, {
        artifactVersion: "1234567890abcdef",
      });
    }

    const result = scheduleMigration(targetDir);

    expect(result.next).toBe("implement-component-batch");
    if (result.next === "implement-component-batch") {
      expect(result.batch.map(component => component.componentGroupId)).toEqual([
        "group-header",
        "group-hero",
      ]);
    }
  });

  it("does not report all-done when page evidence is missing", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "scheduler-"));
    const draft = draftInventory();
    const approved = approvedInventory(draft);
    const paths = migrationPaths(targetDir);
    writeJson(paths.draftInventory, draft);
    writeJson(paths.approvedInventory, approved);
    for (const component of approved.entries) {
      writeComponentApproval(targetDir, component.componentGroupId, component.implementationName, {
        artifactVersion: approved.artifactVersion,
      });
    }

    const result = scheduleMigration(targetDir);

    expect(result).toEqual({
      next: "missing-page-evidence",
      reason: "Raw discovery evidence is required before Page Layout Approval scheduling.",
    });
  });

  it("treats a stale component approval as missing", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "scheduler-"));
    const draft = draftInventory();
    const approved = approvedInventory(draft);
    const paths = migrationPaths(targetDir);
    writeJson(paths.draftInventory, draft);
    writeJson(paths.approvedInventory, approved);
    writeComponentApproval(targetDir, "group-header", "SiteHeader", {
      artifactVersion: approved.artifactVersion,
      staleSince: "2026-05-07T13:00:00.000Z",
    });
    writeComponentApproval(targetDir, "group-hero", "Hero", {
      artifactVersion: approved.artifactVersion,
    });

    const result = scheduleMigration(targetDir);

    expect(result.next).toBe("implement-component-batch");
    if (result.next === "implement-component-batch") {
      expect(result.batch.map(component => component.componentGroupId)).toEqual(["group-header"]);
    }
  });

  it("treats a component approval with mismatched group/name pairing as missing", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "scheduler-"));
    const draft = draftInventory();
    const approved = approvedInventory(draft);
    const paths = migrationPaths(targetDir);
    writeJson(paths.draftInventory, draft);
    writeJson(paths.approvedInventory, approved);
    writeJson(paths.componentApproval("group-header"), {
      kind: "component-batch",
      approvedAt: now,
      artifactVersion: approved.artifactVersion,
      componentGroupIds: ["group-header", "group-hero"],
      implementationNames: ["Hero", "SiteHeader"],
    });
    writeComponentApproval(targetDir, "group-hero", "Hero", {
      artifactVersion: approved.artifactVersion,
    });

    const result = scheduleMigration(targetDir);

    expect(result.next).toBe("implement-component-batch");
    if (result.next === "implement-component-batch") {
      expect(result.batch.map(component => component.componentGroupId)).toEqual(["group-header"]);
    }
  });
});

function draftInventory(entries = [
  entry("group-header", "SiteHeader", "shell", ["p0-s0", "p1-s0"]),
  entry("group-hero", "Hero", "content", ["p0-s1"]),
]): DraftInventory {
  return {
    generatedAt: now,
    revision: 1,
    entries,
  };
}

function entry(
  componentGroupId: string,
  proposedName: string,
  kind: "shell" | "content",
  sectionInstanceIds: string[],
): DraftInventory["entries"][number] {
  return {
    componentGroupId,
    proposedName,
    kind,
    sectionInstanceIds,
  };
}

function approvedInventory(draft: DraftInventory): ApprovedInventory {
  return {
    approvedAt: now,
    artifactVersion: hashArtifact(draft),
    entries: draft.entries.map(component => ({
      ...component,
      implementationName: component.proposedName,
      filePath: `src/components/${component.proposedName}.tsx`,
    })),
  };
}

function rawDiscovery(): RawDiscoveryEvidence {
  return {
    probedAt: now,
    pages: [
      {
        url: "https://example.com/",
        sections: [
          {
            id: "p0-s0",
            selector: "header",
            tagSkeleton: "header>nav",
            pathShingles: [],
            sampleText: "Navigation",
            boundingBox: { x: 0, y: 0, width: 1440, height: 80 },
          },
          {
            id: "p0-s1",
            selector: "main > section",
            tagSkeleton: "section>h1",
            pathShingles: [],
            sampleText: "Hero",
            boundingBox: { x: 0, y: 80, width: 1440, height: 500 },
          },
        ],
      },
    ],
    referenceScreenshots: {
      components: [],
      pages: [
        {
          slug: "home",
          url: "https://example.com/",
          viewport: 1440,
          path: ".migration/references/pages/home-1440.png",
          sha256: "abcdefabcdef1234",
        },
      ],
    },
    source: {
      sourceUrl: "https://example.com/",
      capturedAt: now,
    },
  };
}

function writeComponentApproval(
  targetDir: string,
  componentGroupId: string,
  implementationName: string,
  overrides: Record<string, unknown> = {},
): void {
  writeJson(migrationPaths(targetDir).componentApproval(componentGroupId), {
    kind: "component-batch",
    approvedAt: now,
    artifactVersion: "abcdefabcdef1234",
    componentGroupIds: [componentGroupId],
    implementationNames: [implementationName],
    ...overrides,
  });
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
