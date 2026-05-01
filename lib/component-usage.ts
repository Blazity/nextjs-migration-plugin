import type { Components } from "../schemas/components.ts";
import type { ComponentUsage, ComponentUsageEntry } from "../schemas/component-usage.ts";

export interface BuildComponentUsageInput {
  url: string;
  slug: string;
  sections: { index: number; tagSkeleton: string }[];
  registry: Components;
}

/**
 * Match each extracted section against the Phase 2 cluster registry by
 * exact `tagSkeleton`. Sections that do not match any cluster are recorded
 * in `unmatchedSectionIndices` for downstream triage (typically these
 * indicate a Phase 2 mega-cluster that should have split, or a section
 * unique to this page that needs Phase 4 spec extraction to reveal what
 * it is).
 */
export function buildComponentUsage(input: BuildComponentUsageInput): ComponentUsage {
  const byId = new Map<string, ComponentUsageEntry>();
  const unmatched: number[] = [];

  for (const section of input.sections) {
    const cluster = input.registry.components.find(
      c => c.tagSkeleton === section.tagSkeleton,
    );
    if (!cluster) {
      unmatched.push(section.index);
      continue;
    }
    const existing = byId.get(cluster.id);
    if (existing) {
      existing.instances += 1;
      existing.sectionIndices.push(section.index);
    } else {
      byId.set(cluster.id, {
        id: cluster.id,
        instances: 1,
        sectionIndices: [section.index],
      });
    }
  }

  return {
    url: input.url,
    slug: input.slug,
    computedAt: new Date().toISOString(),
    components: [...byId.values()],
    unmatchedSectionIndices: unmatched,
  };
}
