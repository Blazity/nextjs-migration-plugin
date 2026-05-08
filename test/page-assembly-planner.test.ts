import { describe, expect, it } from "vitest";
import { planPageAssembly } from "../lib/page-assembly-planner.ts";
import type { ApprovedInventory } from "../schemas/approved-inventory.ts";
import type { RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";

const now = "2026-05-07T12:00:00.000Z";

describe("planPageAssembly", () => {
  it("returns approved page components in source section order with shell markers", () => {
    const result = planPageAssembly({
      approvedInventory: approvedInventory(),
      rawDiscovery: rawDiscovery(),
      approvedComponentGroupIds: ["group-header", "group-hero"],
    });

    expect(result).toEqual({
      pages: [{
        slug: "home",
        url: "https://example.com/",
        components: [
          {
            componentGroupId: "group-header",
            implementationName: "SiteHeader",
            kind: "shell",
          },
          {
            componentGroupId: "group-hero",
            implementationName: "Hero",
            kind: "content",
          },
        ],
      }],
      pendingApproval: [],
    });
  });

  it("skips pages whose required components are not all approved", () => {
    const result = planPageAssembly({
      approvedInventory: approvedInventory(),
      rawDiscovery: rawDiscovery(),
      approvedComponentGroupIds: ["group-header"],
    });

    expect(result).toEqual({
      pages: [],
      pendingApproval: [{
        slug: "home",
        url: "https://example.com/",
        componentGroupIds: ["group-hero"],
      }],
    });
  });
});

function approvedInventory(): ApprovedInventory {
  return {
    approvedAt: now,
    artifactVersion: "abcdefabcdef1234",
    entries: [
      {
        componentGroupId: "group-hero",
        proposedName: "Hero",
        kind: "content",
        sectionInstanceIds: ["p0-s1"],
        implementationName: "Hero",
        filePath: "src/components/Hero.tsx",
      },
      {
        componentGroupId: "group-header",
        proposedName: "SiteHeader",
        kind: "shell",
        sectionInstanceIds: ["p0-s0", "p1-s0"],
        implementationName: "SiteHeader",
        filePath: "src/components/SiteHeader.tsx",
      },
    ],
  };
}

function rawDiscovery(): RawDiscoveryEvidence {
  return {
    probedAt: now,
    pages: [{
      url: "https://example.com/",
      sections: [
        {
          id: "p0-s0",
          selector: "header",
          tagSkeleton: "header>nav",
          pathShingles: [],
          sampleText: "Header",
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
    }],
    referenceScreenshots: {
      components: [],
      pages: [{
        slug: "home",
        url: "https://example.com/",
        viewport: 1440,
        path: "references/pages/home-1440.png",
        sha256: "a".repeat(64),
      }],
    },
    source: {
      sourceUrl: "https://example.com/",
      capturedAt: now,
    },
  };
}
