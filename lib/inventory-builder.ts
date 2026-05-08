import { clusterSections, type ClusterOptions, type SectionInput } from "./cluster.ts";
import { signatureDigest } from "./section-signature.ts";
import { DraftInventorySchema, type DraftInventory, type DraftInventoryEntry } from "../schemas/draft-inventory.ts";
import type { RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";
import type { SectionRecord } from "../schemas/sections.ts";

export interface BuildDraftInventoryOptions {
  generatedAt?: string;
  proposedNamesBySignature?: Record<string, string>;
  clusterOptions?: ClusterOptions;
}

const DEFAULT_CLUSTER_OPTIONS: ClusterOptions = {
  autoMergeThreshold: 0.9,
  ambiguousThreshold: 0.75,
};

const SHELL_TAG = /(^|[>,])(header|nav|footer)\b/i;

export function buildDraftInventory(
  evidence: RawDiscoveryEvidence,
  options: BuildDraftInventoryOptions = {},
): DraftInventory {
  const sectionsByInstanceId = new Map<string, SectionRecord>();
  const sectionInputs = evidence.pages.flatMap((page, pageIndex) =>
    page.sections.map((section, sectionIndex): SectionInput => {
      const sectionInstanceId = `p${pageIndex}-s${sectionIndex}`;
      sectionsByInstanceId.set(sectionInstanceId, section);
      return {
        id: sectionInstanceId,
        pathShingles: section.pathShingles,
        tagSkeleton: section.tagSkeleton,
        signals: section.signals,
        pageUrl: page.url,
      };
    }),
  );

  let unnamedGroupCount = 0;
  const { clusters } = clusterSections(sectionInputs, options.clusterOptions ?? DEFAULT_CLUSTER_OPTIONS);
  const entries: DraftInventoryEntry[] = clusters.map(cluster => {
    const signature = signatureDigest({
      tagSkeleton: cluster.representative.tagSkeleton,
      pathShingles: cluster.representative.pathShingles,
      signals: cluster.representative.signals,
    });
    const proposedName = options.proposedNamesBySignature?.[signature] ?? `UnnamedGroup${++unnamedGroupCount}`;

    return {
      componentGroupId: cluster.id,
      proposedName,
      kind: isShellCluster(cluster.memberIds, sectionsByInstanceId) ? "shell" : "content",
      sectionInstanceIds: cluster.memberIds,
    };
  });

  return DraftInventorySchema.parse({
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    revision: 0,
    entries,
  });
}

function isShellCluster(
  sectionInstanceIds: string[],
  sectionsByInstanceId: Map<string, SectionRecord>,
): boolean {
  return sectionInstanceIds.some(sectionInstanceId => {
    const section = sectionsByInstanceId.get(sectionInstanceId);
    return section ? SHELL_TAG.test(section.tagSkeleton) : false;
  });
}
