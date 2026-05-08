import { describe, it, expect } from "vitest";
import {
  compositeShingles,
  jaccard,
  pathShingles,
  signatureDigest,
  tagShingles,
} from "../lib/section-signature.ts";

describe("pathShingles", () => {
  it("produces N-gram path windows of length 3 by default", () => {
    const tags = ["body", "main", "section", "div", "h1"];
    const shingles = pathShingles(tags);
    expect(shingles).toEqual([
      "body>main>section",
      "main>section>div",
      "section>div>h1",
    ]);
  });

  it("returns the full path when tags shorter than n", () => {
    expect(pathShingles(["body", "header"])).toEqual(["body>header"]);
  });

  it("returns empty array when tags is empty", () => {
    expect(pathShingles([])).toEqual([]);
  });
});

describe("jaccard", () => {
  it("returns 1 for identical sets", () => {
    expect(jaccard(["a", "b", "c"], ["a", "b", "c"])).toBe(1);
  });

  it("returns 0 for disjoint sets", () => {
    expect(jaccard(["a", "b"], ["c", "d"])).toBe(0);
  });

  it("returns 0.5 for half overlap", () => {
    // intersection {b} = 1, union {a,b,c} = 3 → 1/3 ≈ 0.333
    expect(jaccard(["a", "b"], ["b", "c"])).toBeCloseTo(0.333, 2);
  });

  it("treats empty inputs as similarity 0", () => {
    expect(jaccard([], [])).toBe(0);
    expect(jaccard(["a"], [])).toBe(0);
  });
});

describe("tagShingles", () => {
  it("splits on > and , and produces N-gram windows", () => {
    expect(tagShingles("section>div,div>h1,p>button")).toEqual([
      "section>div>div",
      "div>div>h1",
      "div>h1>p",
      "h1>p>button",
    ]);
  });

  it("returns the joined tokens when shorter than n", () => {
    expect(tagShingles("header")).toEqual(["header"]);
    expect(tagShingles("section>div")).toEqual(["section>div"]);
  });

  it("returns empty array for an empty skeleton", () => {
    expect(tagShingles("")).toEqual([]);
  });

  it("trims whitespace tokens", () => {
    expect(tagShingles("section > div , h1")).toEqual(["section>div>h1"]);
  });
});

describe("compositeShingles", () => {
  it("namespaces path shingles with `p:` and tag shingles with `t:`", () => {
    const composite = compositeShingles({
      pathShingles: ["body>section"],
      tagSkeleton: "section>div>h1",
    });
    expect(composite).toContain("p:body>section");
    expect(composite).toContain("t:section>div>h1");
    expect(composite.every(s => s.startsWith("p:") || s.startsWith("t:"))).toBe(true);
  });

  it("never overlaps path and tag tokens via the namespace prefixes", () => {
    // Same string ("section>div") would jaccard-match without prefixes.
    const a = compositeShingles({ pathShingles: ["section>div"], tagSkeleton: "" });
    const b = compositeShingles({ pathShingles: [], tagSkeleton: "section>div" });
    expect(jaccard(a, b)).toBe(0);
  });

  it("body-level sections with different children have low Jaccard despite identical pathShingles", () => {
    const hero = compositeShingles({
      pathShingles: ["body>section"],
      tagSkeleton: "section>div>h1,p>button",
    });
    const testimonial = compositeShingles({
      pathShingles: ["body>section"],
      tagSkeleton: "section>blockquote>p,cite",
    });
    expect(jaccard(hero, testimonial)).toBeLessThan(0.5);
  });

  it("adds namespaced section signal tokens to evidence shingles", () => {
    const composite = compositeShingles({
      pathShingles: ["body>section"],
      tagSkeleton: "section>div>div>div>div>div",
      signals: {
        imgCount: "5+",
        videoCount: "0",
        formCount: "0",
        buttonCount: "1",
        headingCount: "1",
        liCount: "0",
        textLen: "<200",
        height: "<400",
      },
    });

    expect(composite).toContain("s:imgCount=5+");
    expect(composite).toContain("s:textLen=<200");
    expect(composite.every(s => s.startsWith("p:") || s.startsWith("t:") || s.startsWith("s:"))).toBe(true);
  });
});

describe("signatureDigest", () => {
  it("produces a stable hex digest for the same input", () => {
    const a = signatureDigest({ tagSkeleton: "section>div>h1", pathShingles: ["body>main>section"] });
    const b = signatureDigest({ tagSkeleton: "section>div>h1", pathShingles: ["body>main>section"] });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16,}$/);
  });

  it("changes when tagSkeleton changes", () => {
    const a = signatureDigest({ tagSkeleton: "section>div>h1", pathShingles: [] });
    const b = signatureDigest({ tagSkeleton: "section>div>h2", pathShingles: [] });
    expect(a).not.toBe(b);
  });
});
