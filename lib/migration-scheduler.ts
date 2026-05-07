import { existsSync, readFileSync } from "node:fs";
import { URL } from "node:url";
import {
  ComponentBatchApprovalSchema,
  PageLayoutApprovalSchema,
} from "../schemas/approval.ts";
import {
  ApprovedInventorySchema,
  type ApprovedInventoryEntry,
} from "../schemas/approved-inventory.ts";
import { DraftInventorySchema } from "../schemas/draft-inventory.ts";
import { RawDiscoveryEvidenceSchema, type RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";
import { hashArtifact } from "./artifact-hash.ts";
import { migrationPaths } from "./migration-paths.ts";

export type MigrationSchedule =
  | Readonly<{
      next: "review-inventory";
      artifactVersion: string;
      reviewHtmlPath: string;
      staleApproval?: Readonly<{
        approval: "component-inventory";
        staleSince?: string;
      }>;
    }>
  | Readonly<{
      next: "implement-component-batch";
      artifactVersion: string;
      batch: ApprovedInventoryEntry[];
    }>
  | Readonly<{
      next: "assemble-page";
      slug: string;
      componentGroupIds: string[];
    }>
  | Readonly<{
      next: "missing-page-evidence";
      reason: string;
    }>
  | Readonly<{ next: "all-done" }>;

export function scheduleMigration(targetDir: string): MigrationSchedule {
  const paths = migrationPaths(targetDir);
  const draftInventory = existsSync(paths.draftInventory)
    ? DraftInventorySchema.parse(readJson(paths.draftInventory))
    : undefined;

  if (!existsSync(paths.approvedInventory)) {
    return {
      next: "review-inventory",
      artifactVersion: draftInventory ? hashArtifact(draftInventory) : "",
      reviewHtmlPath: paths.reviewHtml,
    };
  }

  const approvedInventory = ApprovedInventorySchema.parse(readJson(paths.approvedInventory));
  const liveDraftArtifactVersion = draftInventory
    ? hashArtifact(draftInventory)
    : approvedInventory.artifactVersion;
  if (
    approvedInventory.staleSince ||
    approvedInventory.artifactVersion !== liveDraftArtifactVersion
  ) {
    return {
      next: "review-inventory",
      artifactVersion: liveDraftArtifactVersion,
      reviewHtmlPath: paths.reviewHtml,
      staleApproval: {
        approval: "component-inventory",
        staleSince: approvedInventory.staleSince,
      },
    };
  }

  const missingComponentApprovals = approvedInventory.entries
    .map((component, index) => ({ component, index }))
    .filter(({ component }) =>
      !hasCleanComponentApproval(targetDir, component, approvedInventory.artifactVersion)
    )
    .sort((a, b) => componentOrder(a, b))
    .slice(0, 3)
    .map(({ component }) => component);

  if (missingComponentApprovals.length > 0) {
    return {
      next: "implement-component-batch",
      artifactVersion: approvedInventory.artifactVersion,
      batch: missingComponentApprovals,
    };
  }

  const rawDiscovery = existsSync(paths.rawDiscovery)
    ? RawDiscoveryEvidenceSchema.parse(readJson(paths.rawDiscovery))
    : undefined;
  if (!rawDiscovery) {
    return {
      next: "missing-page-evidence",
      reason: "Raw discovery evidence is required before Page Layout Approval scheduling.",
    };
  }
  const nextPage = rawDiscovery
    ? firstPageWithoutCleanApproval(targetDir, approvedInventory.entries, rawDiscovery)
    : undefined;
  if (nextPage) {
    return {
      next: "assemble-page",
      slug: nextPage.slug,
      componentGroupIds: nextPage.componentGroupIds,
    };
  }

  return { next: "all-done" };
}

function componentOrder(
  a: { component: ApprovedInventoryEntry; index: number },
  b: { component: ApprovedInventoryEntry; index: number },
): number {
  const kind = kindRank(a.component) - kindRank(b.component);
  if (kind !== 0) return kind;

  const reuse = b.component.sectionInstanceIds.length - a.component.sectionInstanceIds.length;
  if (reuse !== 0) return reuse;

  return a.index - b.index;
}

function kindRank(component: ApprovedInventoryEntry): number {
  return component.kind === "shell" ? 0 : 1;
}

function hasCleanComponentApproval(
  targetDir: string,
  component: ApprovedInventoryEntry,
  artifactVersion: string,
): boolean {
  const path = migrationPaths(targetDir).componentApproval(component.componentGroupId);
  if (!existsSync(path)) return false;

  const approval = ComponentBatchApprovalSchema.parse(readJson(path));
  const componentIndex = approval.componentGroupIds.indexOf(component.componentGroupId);
  return !approval.staleSince &&
    approval.artifactVersion === artifactVersion &&
    componentIndex >= 0 &&
    approval.implementationNames[componentIndex] === component.implementationName;
}

function firstPageWithoutCleanApproval(
  targetDir: string,
  components: ApprovedInventoryEntry[],
  rawDiscovery: RawDiscoveryEvidence,
): { slug: string; componentGroupIds: string[] } | undefined {
  const pageReferences = new Map(
    rawDiscovery.referenceScreenshots.pages.map(reference => [
      reference.url,
      reference.slug,
    ]),
  );

  for (const page of rawDiscovery.pages) {
    const slug = pageReferences.get(page.url) ?? slugFromUrl(page.url);
    const componentGroupIds = componentsForPage(
      components,
      new Set(page.sections.map(section => section.id)),
    );
    if (componentGroupIds.length === 0) continue;
    if (!hasCleanPageApproval(targetDir, slug, componentGroupIds)) {
      return { slug, componentGroupIds };
    }
  }

  return undefined;
}

function componentsForPage(
  components: ApprovedInventoryEntry[],
  sectionIds: Set<string>,
): string[] {
  return components
    .filter(component =>
      component.sectionInstanceIds.some(sectionId => sectionIds.has(sectionId)),
    )
    .map(component => component.componentGroupId);
}

function hasCleanPageApproval(
  targetDir: string,
  slug: string,
  componentGroupIds: string[],
): boolean {
  const path = migrationPaths(targetDir).pageApproval(slug);
  if (!existsSync(path)) return false;

  const approval = PageLayoutApprovalSchema.parse(readJson(path));
  return !approval.staleSince &&
    approval.slug === slug &&
    sameStringSet(approval.componentGroupIds, componentGroupIds);
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every(value => rightSet.has(value));
}

function slugFromUrl(value: string): string {
  const url = new URL(value);
  const pathname = url.pathname.replace(/^\/|\/$/g, "");
  return pathname === "" ? "home" : pathname.replace(/[^A-Za-z0-9]+/g, "-");
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}
