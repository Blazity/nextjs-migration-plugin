import { compositeShingles, jaccard, signatureDigest } from "./section-signature.ts";
import type { SectionSignals } from "../schemas/sections.ts";

export interface SectionInput {
  id: string;
  pathShingles: string[];
  tagSkeleton: string;
  pageUrl: string;
  signals?: Partial<SectionSignals>;
}

export interface Cluster {
  id: string;
  representative: SectionInput;
  memberIds: string[];
}

export interface AmbiguousPair {
  a: string;
  b: string;
  similarity: number;
}

export interface ClusterResult {
  clusters: Cluster[];
  ambiguousPairs: AmbiguousPair[];
  /** Sections that ended up as singletons after clustering. */
  unique: SectionInput[];
}

export interface ClusterOptions {
  autoMergeThreshold: number;
  ambiguousThreshold: number;
}

export function clusterSections(
  sections: SectionInput[],
  opts: ClusterOptions,
): ClusterResult {
  const clusters: Cluster[] = [];
  const ambiguousPairs: AmbiguousPair[] = [];

  for (const section of sections) {
    let bestCluster: Cluster | null = null;
    let bestSimilarity = 0;
    // Composite shingles combine ancestor-path with descendant-tag tokens so
    // body-level sections (whose pathShingles all collapse to ["body>section"])
    // can still be discriminated by their internal structure.
    const sectionShingles = compositeShingles({
      pathShingles: section.pathShingles,
      tagSkeleton: section.tagSkeleton,
      signals: section.signals,
    });

    for (const cluster of clusters) {
      const clusterShingles = compositeShingles({
        pathShingles: cluster.representative.pathShingles,
        tagSkeleton: cluster.representative.tagSkeleton,
        signals: cluster.representative.signals,
      });
      const sim = jaccard(sectionShingles, clusterShingles);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestCluster = cluster;
      }
      if (sim >= opts.ambiguousThreshold && sim < opts.autoMergeThreshold) {
        ambiguousPairs.push({ a: section.id, b: cluster.representative.id, similarity: sim });
      }
    }

    if (bestCluster && bestSimilarity >= opts.autoMergeThreshold) {
      bestCluster.memberIds.push(section.id);
    } else {
      const id = `cluster-${signatureDigest({
        tagSkeleton: section.tagSkeleton,
        pathShingles: section.pathShingles,
        signals: section.signals,
      })}`;
      clusters.push({ id, representative: section, memberIds: [section.id] });
    }
  }

  // Per spec § 5 row 2: every section "belongs to a cluster or is marked
  // unique". A singleton cluster — one whose only member is itself — is the
  // "marked unique" case. Multi-member clusters do not appear in `unique`.
  const unique = clusters
    .filter(c => c.memberIds.length === 1)
    .map(c => c.representative);

  return { clusters, ambiguousPairs, unique };
}
