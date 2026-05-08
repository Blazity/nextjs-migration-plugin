import { describe, expect, it } from "vitest";
import { buildDraftInventory } from "../lib/inventory-builder.ts";
import { signatureDigest } from "../lib/section-signature.ts";
import { DraftInventorySchema } from "../schemas/draft-inventory.ts";
import type { RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";
import type { SectionRecord } from "../schemas/sections.ts";

const generatedAt = "2026-05-07T12:00:00.000Z";

function section(
  id: string,
  tagSkeleton: string,
  pathShingles: string[],
  signals?: SectionRecord["signals"],
): SectionRecord {
  return {
    id,
    selector: `#${id}`,
    tagSkeleton,
    pathShingles,
    sampleText: "",
    boundingBox: { x: 0, y: 0, width: 1200, height: 200 },
    signals,
  };
}

const heroSignature = {
  tagSkeleton: "section>div>h1,p>button",
  pathShingles: ["body>main>section", "main>section>div"],
};

const shellSignature = {
  tagSkeleton: "header>nav>a,nav>button",
  pathShingles: ["body>header>nav", "header>nav>a"],
};

const evidence: RawDiscoveryEvidence = {
  probedAt: generatedAt,
  pages: [
    {
      url: "https://example.com/",
      sections: [
        section("original-header-home", shellSignature.tagSkeleton, shellSignature.pathShingles),
        section("original-hero-home", heroSignature.tagSkeleton, heroSignature.pathShingles),
      ],
    },
    {
      url: "https://example.com/pricing",
      sections: [
        section("original-header-pricing", shellSignature.tagSkeleton, shellSignature.pathShingles),
        section("original-hero-pricing", heroSignature.tagSkeleton, heroSignature.pathShingles),
      ],
    },
    {
      url: "https://example.com/about",
      sections: [
        section("original-hero-about", heroSignature.tagSkeleton, heroSignature.pathShingles),
      ],
    },
  ],
  referenceScreenshots: {
    components: [],
    pages: [],
  },
  source: {
    sourceUrl: "https://example.com/",
    capturedAt: generatedAt,
  },
};

describe("buildDraftInventory", () => {
  it("clusters raw sections into stable draft inventory entries with shell detection and proposed names", () => {
    const inventory = buildDraftInventory(evidence, {
      generatedAt,
      proposedNamesBySignature: {
        [signatureDigest(heroSignature)]: "Hero",
      },
    });
    const rerun = buildDraftInventory(evidence, {
      generatedAt,
      proposedNamesBySignature: {
        [signatureDigest(heroSignature)]: "Hero",
      },
    });

    expect(DraftInventorySchema.safeParse(inventory).success).toBe(true);
    expect(inventory.entries).toHaveLength(2);
    expect(inventory.entries.map(entry => entry.sectionInstanceIds)).toEqual(
      rerun.entries.map(entry => entry.sectionInstanceIds),
    );

    const shell = inventory.entries.find(entry => entry.kind === "shell");
    const hero = inventory.entries.find(entry => entry.proposedName === "Hero");

    expect(shell).toMatchObject({
      componentGroupId: `cluster-${signatureDigest(shellSignature)}`,
      proposedName: "UnnamedGroup1",
      kind: "shell",
      sectionInstanceIds: ["p0-s0", "p1-s0"],
    });
    expect(hero).toMatchObject({
      componentGroupId: `cluster-${signatureDigest(heroSignature)}`,
      proposedName: "Hero",
      kind: "content",
      sectionInstanceIds: ["p0-s1", "p1-s1", "p2-s0"],
    });
  });

  it("uses section signals to avoid merging visually different Webflow-style body sections", () => {
    const shallowSkeleton = "section>div>div>div>div>div";
    const shallowPath = ["body>section"];
    const webflowEvidence: RawDiscoveryEvidence = {
      ...evidence,
      pages: [{
        url: "https://example.com/",
        sections: [
          section("hero", shallowSkeleton, shallowPath, {
            imgCount: "1",
            videoCount: "0",
            formCount: "0",
            buttonCount: "1",
            headingCount: "1",
            liCount: "0",
            textLen: "<200",
            height: "<800",
          }),
          section("logo-carousel", shallowSkeleton, shallowPath, {
            imgCount: "5+",
            videoCount: "0",
            formCount: "0",
            buttonCount: "0",
            headingCount: "0",
            liCount: "0",
            textLen: "<50",
            height: "<400",
          }),
          section("contact-form", shallowSkeleton, shallowPath, {
            imgCount: "0",
            videoCount: "0",
            formCount: "1+",
            buttonCount: "1",
            headingCount: "1",
            liCount: "0",
            textLen: "<200",
            height: "<800",
          }),
        ],
      }],
    };

    const inventory = buildDraftInventory(webflowEvidence, { generatedAt });

    expect(inventory.entries).toHaveLength(3);
    expect(inventory.entries.map(entry => entry.sectionInstanceIds)).toEqual([
      ["p0-s0"],
      ["p0-s1"],
      ["p0-s2"],
    ]);
  });

  it("still merges obvious sibling variants with only minor signal bucket drift", () => {
    const shallowSkeleton = "section>div>div>div>div>div";
    const shallowPath = ["body>section"];
    const siblingEvidence: RawDiscoveryEvidence = {
      ...evidence,
      pages: [{
        url: "https://example.com/",
        sections: [
          section("cta-short", shallowSkeleton, shallowPath, {
            imgCount: "0",
            videoCount: "0",
            formCount: "0",
            buttonCount: "1",
            headingCount: "1",
            liCount: "0",
            textLen: "<200",
            height: "<400",
          }),
          section("cta-taller", shallowSkeleton, shallowPath, {
            imgCount: "0",
            videoCount: "0",
            formCount: "0",
            buttonCount: "1",
            headingCount: "1",
            liCount: "0",
            textLen: "<200",
            height: "<800",
          }),
        ],
      }],
    };

    const inventory = buildDraftInventory(siblingEvidence, { generatedAt });

    expect(inventory.entries).toHaveLength(1);
    expect(inventory.entries[0].sectionInstanceIds).toEqual(["p0-s0", "p0-s1"]);
  });
});
