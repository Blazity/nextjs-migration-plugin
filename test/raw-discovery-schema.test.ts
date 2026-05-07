import { describe, expect, it } from "vitest";
import { RawDiscoveryEvidenceSchema } from "../schemas/raw-discovery.ts";

const section = {
  id: "section-home-hero",
  selector: "main > section:nth-of-type(1)",
  tagSkeleton: "section>h1+p",
  pathShingles: ["main>section", "section>h1"],
  sampleText: "Hero",
  boundingBox: { x: 0, y: 0, width: 390, height: 240 },
};

const componentReference = {
  sectionInstanceId: "section-home-hero",
  url: "https://example.com/",
  viewport: 390,
  path: "references/components/section-home-hero-390.png",
  sha256: "0123456789abcdef",
};

const pageReference = {
  slug: "home",
  url: "https://example.com/",
  viewport: 1440,
  path: "references/pages/home-1440.png",
  sha256: "abcdef0123456789",
};

const validRecord = {
  probedAt: "2026-05-07T10:00:00.000Z",
  pages: [{
    url: "https://example.com/",
    sections: [section],
  }],
  referenceScreenshots: {
    components: [componentReference],
    pages: [pageReference],
  },
  source: {
    sourceUrl: "https://example.com/",
    capturedAt: "2026-05-07T10:00:01.000Z",
  },
};

describe("RawDiscoveryEvidenceSchema", () => {
  it("accepts a minimal valid raw discovery evidence record", () => {
    expect(RawDiscoveryEvidenceSchema.safeParse(validRecord).success).toBe(true);
  });

  it("rejects a page with empty sections", () => {
    const result = RawDiscoveryEvidenceSchema.safeParse({
      ...validRecord,
      pages: [{
        ...validRecord.pages[0],
        sections: [],
      }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(issue => issue.path.join(".") === "pages.0.sections")).toBe(true);
    }
  });

  it("rejects missing referenceScreenshots", () => {
    const { referenceScreenshots, ...withoutReferences } = validRecord;

    const result = RawDiscoveryEvidenceSchema.safeParse(withoutReferences);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(issue => issue.path.includes("referenceScreenshots"))).toBe(true);
    }
  });

  it("rejects unknown viewport ints", () => {
    const result = RawDiscoveryEvidenceSchema.safeParse({
      ...validRecord,
      referenceScreenshots: {
        ...validRecord.referenceScreenshots,
        components: [{
          ...componentReference,
          viewport: 1024,
        }],
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(issue => issue.path.join(".") === "referenceScreenshots.components.0.viewport")).toBe(true);
    }
  });
});
