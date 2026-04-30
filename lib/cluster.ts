import { jaccard, signatureDigest } from "./section-signature.ts";

export interface SectionInput {
  id: string;
  pathShingles: string[];
  tagSkeleton: string;
  pageUrl: string;
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

    for (const cluster of clusters) {
      const sim = jaccard(section.pathShingles, cluster.representative.pathShingles);
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
      })}`;
      clusters.push({ id, representative: section, memberIds: [section.id] });
    }
  }

  const allSingletons = clusters.every(c => c.memberIds.length === 1);
  const unique = allSingletons
    ? clusters.map(c => c.representative)
    : [];

  return { clusters, ambiguousPairs, unique };
}
