import { describe, it, expect } from "vitest";
import { pathShingles, jaccard, signatureDigest } from "../lib/section-signature.ts";

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
