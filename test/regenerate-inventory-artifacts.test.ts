import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { regenerateInventoryArtifacts } from "../lib/regenerate-inventory-artifacts.ts";
import { hashArtifact } from "../lib/artifact-hash.ts";
import { migrationPaths } from "../lib/migration-paths.ts";
import type { DraftInventory } from "../schemas/draft-inventory.ts";
import type { RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";

const timestamp = "2026-05-07T12:00:00.000Z";

const draft: DraftInventory = {
  generatedAt: timestamp,
  revision: 0,
  entries: [
    {
      componentGroupId: "group-one",
      proposedName: "Component1",
      kind: "content",
      sectionInstanceIds: ["p0-s0"],
    },
  ],
};

const evidence: RawDiscoveryEvidence = {
  probedAt: timestamp,
  pages: [{
    url: "https://example.com/",
    sections: [{
      id: "p0-s0",
      selector: "main > section",
      tagSkeleton: "section>h1",
      pathShingles: ["body>main>section"],
      sampleText: "Hero",
      boundingBox: { x: 0, y: 0, width: 100, height: 100 },
    }],
  }],
  referenceScreenshots: {
    components: [{
      sectionInstanceId: "p0-s0",
      url: "https://example.com/",
      viewport: 390,
      path: "references/components/p0-s0-390.png",
      sha256: "0".repeat(64),
    }],
    pages: [],
  },
  source: {
    sourceUrl: "https://example.com/",
    capturedAt: timestamp,
  },
};

describe("regenerateInventoryArtifacts", () => {
  it("applies corrections, rewrites draft JSON, regenerates HTML, and returns the new artifact version", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "regen-inventory-"));
    const paths = migrationPaths(targetDir);
    writeJson(paths.draftInventory, draft);
    writeJson(paths.rawDiscovery, evidence);

    const result = regenerateInventoryArtifacts({
      targetDir,
      corrections: [{ type: "rename", componentGroupId: "group-one", newName: "Hero" }],
    });

    const updated = JSON.parse(readFileSync(paths.draftInventory, "utf8"));
    expect(updated.entries[0].proposedName).toBe("Hero");
    expect(updated.revision).toBe(1);
    expect(result).toEqual({
      artifactVersion: hashArtifact(updated),
      draftInventoryPath: paths.draftInventory,
      reviewHtmlPath: paths.reviewHtml,
      blockingNames: [],
    });
    expect(existsSync(paths.reviewHtml)).toBe(true);
    expect(readFileSync(paths.reviewHtml, "utf8")).toContain("Hero");
  });

  it("saves drafts with blocking names and reports them", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "regen-inventory-"));
    const paths = migrationPaths(targetDir);
    writeJson(paths.draftInventory, {
      ...draft,
      entries: [{ ...draft.entries[0], proposedName: "Hero" }],
    });
    writeJson(paths.rawDiscovery, evidence);

    const result = regenerateInventoryArtifacts({
      targetDir,
      corrections: [{ type: "rename", componentGroupId: "group-one", newName: "Component3" }],
    });

    const updated = JSON.parse(readFileSync(paths.draftInventory, "utf8"));
    expect(updated.entries[0].proposedName).toBe("Component3");
    expect(result.blockingNames).toEqual(["Component3"]);
  });
});

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}
