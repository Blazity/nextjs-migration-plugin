import { describe, it, expect } from "vitest";
import { clusterSections, type SectionInput } from "../lib/cluster.ts";

const mk = (id: string, shingles: string[], skeleton = "section"): SectionInput => ({
  id,
  pathShingles: shingles,
  tagSkeleton: skeleton,
  pageUrl: "https://example.com/",
});

describe("clusterSections", () => {
  it("groups sections with jaccard >= autoMergeThreshold into the same cluster", () => {
    const sections = [
      mk("a", ["body>main>section", "main>section>div", "section>div>h1"]),
      mk("b", ["body>main>section", "main>section>div", "section>div>h1"]),
      mk("c", ["body>footer>div", "footer>div>p"]),
    ];
    const { clusters, ambiguousPairs, unique } = clusterSections(sections, {
      autoMergeThreshold: 0.85,
      ambiguousThreshold: 0.6,
    });
    expect(clusters.find(c => c.memberIds.includes("a"))?.memberIds.sort()).toEqual(["a", "b"]);
    expect(clusters.find(c => c.memberIds.includes("c"))?.memberIds).toEqual(["c"]);
    expect(unique.map(u => u.id).sort()).toEqual([]);
    expect(ambiguousPairs).toEqual([]);
  });

  it("surfaces ambiguous pairs whose similarity is between thresholds", () => {
    const sections = [
      mk("a", ["body>main>section", "main>section>div", "section>div>h1"]),
      mk("b", ["body>main>section", "main>section>div", "section>div>h2"]),
    ];
    const { clusters, ambiguousPairs } = clusterSections(sections, {
      autoMergeThreshold: 0.85,
      ambiguousThreshold: 0.5,
    });
    expect(clusters.length).toBe(2);
    expect(ambiguousPairs.length).toBe(1);
    expect(ambiguousPairs[0].similarity).toBeGreaterThanOrEqual(0.5);
    expect(ambiguousPairs[0].similarity).toBeLessThan(0.85);
  });

  it("marks sections with no near-matches as unique singletons", () => {
    const sections = [mk("solo", ["body>div>span"])];
    const { clusters, unique } = clusterSections(sections, {
      autoMergeThreshold: 0.85,
      ambiguousThreshold: 0.5,
    });
    expect(clusters.length).toBe(1);
    expect(clusters[0].memberIds).toEqual(["solo"]);
    expect(unique.map(u => u.id)).toEqual(["solo"]);
  });

  it("derives stable cluster ids from the cluster representative signature", () => {
    const sections1 = [
      mk("a", ["body>main>section", "main>section>div", "section>div>h1"]),
      mk("b", ["body>main>section", "main>section>div", "section>div>h1"]),
    ];
    const sections2 = [
      mk("x", ["body>main>section", "main>section>div", "section>div>h1"]),
      mk("y", ["body>main>section", "main>section>div", "section>div>h1"]),
    ];
    const r1 = clusterSections(sections1, { autoMergeThreshold: 0.85, ambiguousThreshold: 0.5 });
    const r2 = clusterSections(sections2, { autoMergeThreshold: 0.85, ambiguousThreshold: 0.5 });
    expect(r1.clusters[0].id).toBe(r2.clusters[0].id);
  });
});
