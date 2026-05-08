import { describe, expect, it } from "vitest";
import { renderInventoryReviewHtml } from "../lib/inventory-review-html.ts";
import type { DraftInventory } from "../schemas/draft-inventory.ts";
import type { RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";

const draftInventory: DraftInventory = {
  generatedAt: "2026-05-07T12:00:00.000Z",
  revision: 0,
  entries: [
    {
      componentGroupId: "cluster-hero",
      proposedName: "Hero",
      kind: "content",
      sectionInstanceIds: ["p0-s0", "p1-s0", "p2-s0", "p3-s0"],
    },
    {
      componentGroupId: "cluster-placeholder",
      proposedName: "P0S1",
      kind: "content",
      sectionInstanceIds: ["p0-s1"],
    },
  ],
};

const evidence: RawDiscoveryEvidence = {
  probedAt: "2026-05-07T12:00:00.000Z",
  pages: [
    page("https://example.com/", "p0-s0", "p0-s1"),
    page("https://example.com/about", "p1-s0"),
    page("https://example.com/pricing", "p2-s0"),
    page("https://example.com/contact", "p3-s0"),
  ],
  referenceScreenshots: {
    components: [
      componentReference("p0-s0", 390),
      componentReference("p0-s0", 768),
      componentReference("p0-s0", 1440),
      componentReference("p1-s0", 390),
      componentReference("p2-s0", 390),
      componentReference("p3-s0", 390),
      componentReference("p0-s1", 390),
    ],
    pages: [],
  },
  source: {
    sourceUrl: "https://example.com/",
    capturedAt: "2026-05-07T12:00:00.000Z",
  },
};

describe("renderInventoryReviewHtml", () => {
  it("renders grouped read-only inventory review content with viewport images and source links", () => {
    const html = renderInventoryReviewHtml({ draftInventory, evidence, sampleLimit: 3 });

    expect(html).toContain("Read-only &mdash; request changes in chat");
    expect(html).toContain("Approval blocked: 1 components have generic or ID-like names");
    expect(html).toContain('data-component-group-id="cluster-hero"');
    expect(html).toContain('data-copy="Hero"');
    expect(html).toContain('data-copy="cluster-hero"');
    expect(html).toContain('data-copy="p0-s0"');
    expect(html).toContain("navigator.clipboard.writeText");
    expect(html).toContain("Hero");
    expect(html).toContain("p0-s0");
    expect(html).toContain('<a href="https://example.com/about">https://example.com/about</a>');
    expect(html).toContain('data-viewport="390"');
    expect(html).toContain('data-viewport="768"');
    expect(html).toContain('data-viewport="1440"');
    expect(html).toContain('src="../references/components/p0-s0-390.png"');
    expect(html).toContain('data-src-768="../references/components/p0-s0-768.png"');
    expect(html).toContain('data-action="reveal"');
    expect(html).toContain("Reveal hidden");
    expect(html).toContain('data-hidden="true"');
  });
});

function page(url: string, ...sectionIds: string[]): RawDiscoveryEvidence["pages"][number] {
  return {
    url,
    sections: sectionIds.map(id => ({
      id,
      selector: "main > section",
      tagSkeleton: "section>h2",
      pathShingles: ["body>main>section"],
      sampleText: id,
      boundingBox: { x: 0, y: 0, width: 300, height: 200 },
    })),
  };
}

function componentReference(
  sectionInstanceId: string,
  viewport: 390 | 768 | 1440,
): RawDiscoveryEvidence["referenceScreenshots"]["components"][number] {
  return {
    sectionInstanceId,
    url: "https://example.com/",
    viewport,
    path: `references/components/${sectionInstanceId}-${viewport}.png`,
    sha256: "0".repeat(64),
  };
}
