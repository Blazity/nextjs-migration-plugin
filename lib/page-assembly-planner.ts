import { ApprovedInventorySchema, type ApprovedInventoryEntry } from "../schemas/approved-inventory.ts";
import { RawDiscoveryEvidenceSchema, type RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";
import { urlToSlug } from "./slug.ts";

export interface PageAssemblyComponentPlan {
  componentGroupId: string;
  implementationName: string;
  kind: "shell" | "content";
}

export interface PageAssemblyPagePlan {
  slug: string;
  url: string;
  components: PageAssemblyComponentPlan[];
}

export interface PendingPageAssemblyApproval {
  slug: string;
  url: string;
  componentGroupIds: string[];
}

export interface PageAssemblyPlan {
  pages: PageAssemblyPagePlan[];
  pendingApproval: PendingPageAssemblyApproval[];
}

export interface PlanPageAssemblyArgs {
  approvedInventory: unknown;
  rawDiscovery: unknown;
  approvedComponentGroupIds?: readonly string[];
}

export function planPageAssembly(args: PlanPageAssemblyArgs): PageAssemblyPlan {
  const approvedInventory = ApprovedInventorySchema.parse(args.approvedInventory);
  const rawDiscovery = RawDiscoveryEvidenceSchema.parse(args.rawDiscovery);
  const approvedComponentGroupIds = new Set(
    args.approvedComponentGroupIds ??
      approvedInventory.entries.map(component => component.componentGroupId),
  );
  const slugByUrl = new Map(
    rawDiscovery.referenceScreenshots.pages.map(reference => [reference.url, reference.slug]),
  );
  const pages: PageAssemblyPagePlan[] = [];
  const pendingApproval: PendingPageAssemblyApproval[] = [];

  for (const page of rawDiscovery.pages) {
    const components = componentsForPage({
      entries: approvedInventory.entries,
      sectionIds: page.sections.map(section => section.id),
    });
    if (components.length === 0) continue;

    const missing = components
      .filter(component => !approvedComponentGroupIds.has(component.componentGroupId))
      .map(component => component.componentGroupId);
    const slug = slugByUrl.get(page.url) ?? urlToSlug(page.url);

    if (missing.length > 0) {
      pendingApproval.push({
        slug,
        url: page.url,
        componentGroupIds: missing,
      });
      continue;
    }

    pages.push({
      slug,
      url: page.url,
      components: components.map(component => ({
        componentGroupId: component.componentGroupId,
        implementationName: component.implementationName,
        kind: component.kind,
      })),
    });
  }

  return { pages, pendingApproval };
}

function componentsForPage(args: {
  entries: ApprovedInventoryEntry[];
  sectionIds: string[];
}): ApprovedInventoryEntry[] {
  const sectionOrder = new Map(
    args.sectionIds.map((sectionId, index) => [sectionId, index]),
  );
  return args.entries
    .map(entry => ({
      entry,
      firstSectionIndex: firstSectionIndex(entry.sectionInstanceIds, sectionOrder),
    }))
    .filter(candidate => candidate.firstSectionIndex !== undefined)
    .sort((a, b) => (a.firstSectionIndex ?? 0) - (b.firstSectionIndex ?? 0))
    .map(candidate => candidate.entry);
}

function firstSectionIndex(
  sectionInstanceIds: string[],
  sectionOrder: Map<string, number>,
): number | undefined {
  return sectionInstanceIds
    .map(sectionId => sectionOrder.get(sectionId))
    .filter((index): index is number => index !== undefined)
    .sort((a, b) => a - b)[0];
}
