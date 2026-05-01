import { describe, it, expect } from "vitest";
import { buildComponentUsage } from "../lib/component-usage.ts";
import type { Components } from "../schemas/components.ts";

const isoNow = new Date().toISOString();

const componentsRegistry: Components = {
  components: [
    {
      id: "cluster-hero",
      name: "Hero",
      signature: "hero",
      tagSkeleton: "section>div>h1",
      memberSections: [{ id: "p0-s0", url: "https://example.com/" }],
      unique: false,
      propsRef: "HeroProps",
    },
    {
      id: "cluster-card",
      name: "Card",
      signature: "card",
      tagSkeleton: "section>div>img",
      memberSections: [{ id: "p1-s0", url: "https://example.com/about" }],
      unique: false,
      propsRef: "CardProps",
    },
  ],
  updatedAt: isoNow,
};

describe("buildComponentUsage", () => {
  it("matches each section to its cluster id by exact tagSkeleton", () => {
    const result = buildComponentUsage({
      url: "https://example.com/",
      slug: "home",
      sections: [
        { index: 0, tagSkeleton: "section>div>h1" },
        { index: 1, tagSkeleton: "section>div>img" },
        { index: 2, tagSkeleton: "section>div>h1" },
      ],
      registry: componentsRegistry,
    });
    expect(result.components.map(c => c.id).sort()).toEqual(["cluster-card", "cluster-hero"]);
    const hero = result.components.find(c => c.id === "cluster-hero");
    expect(hero?.instances).toBe(2);
    expect(hero?.sectionIndices.sort()).toEqual([0, 2]);
    const card = result.components.find(c => c.id === "cluster-card");
    expect(card?.instances).toBe(1);
    expect(card?.sectionIndices).toEqual([1]);
  });

  it("collects unmatched section indices", () => {
    const result = buildComponentUsage({
      url: "https://example.com/",
      slug: "home",
      sections: [
        { index: 0, tagSkeleton: "section>div>h1" },
        { index: 1, tagSkeleton: "footer>nothing-matches" },
      ],
      registry: componentsRegistry,
    });
    expect(result.unmatchedSectionIndices).toEqual([1]);
  });

  it("returns empty components when no sections match", () => {
    const result = buildComponentUsage({
      url: "https://example.com/",
      slug: "home",
      sections: [{ index: 0, tagSkeleton: "blockquote>p" }],
      registry: componentsRegistry,
    });
    expect(result.components).toEqual([]);
    expect(result.unmatchedSectionIndices).toEqual([0]);
  });

  it("populates url + slug + computedAt", () => {
    const result = buildComponentUsage({
      url: "https://example.com/",
      slug: "home",
      sections: [],
      registry: componentsRegistry,
    });
    expect(result.url).toBe("https://example.com/");
    expect(result.slug).toBe("home");
    expect(result.computedAt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
