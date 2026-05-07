import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ComponentBatchApprovalSchema, PageLayoutApprovalSchema } from "../schemas/approval.ts";
import { ApprovedInventorySchema, type ApprovedInventoryEntry } from "../schemas/approved-inventory.ts";
import { DraftInventorySchema, type DraftInventory } from "../schemas/draft-inventory.ts";
import { hashArtifact } from "./artifact-hash.ts";
import { loadSite } from "./load-site.ts";
import { migrationPaths } from "./migration-paths.ts";
import { loadQueueConfig } from "./queue-config.ts";
import type { SiteFrontmatter } from "../schemas/site.ts";

export type ApprovalSummaryStatus = "approved" | "pending" | "stale";

export interface DraftInventoryStatus {
  revision: number;
  hash: string;
  blockingNames: string[];
}

export interface ComponentApprovalStatus {
  componentGroupId: string;
  implementationName: string;
  status: ApprovalSummaryStatus;
}

export interface PageApprovalStatus {
  slug: string;
  componentGroupIds: string[];
  status: "approved" | "stale";
}

export type Status =
  | { initialized: false }
  | {
      initialized: true;
      sourceUrl: SiteFrontmatter["sourceUrl"];
      inputMode: SiteFrontmatter["inputMode"];
      draftInventory: DraftInventoryStatus | null;
      approvals: {
        inventory: "approved" | "draft" | "stale";
        components: ComponentApprovalStatus[];
        pages: PageApprovalStatus[];
      };
      queueConcurrency: number;
    };

export async function getStatus(targetDir: string): Promise<Status> {
  const migrationDir = join(targetDir, ".migration");
  if (!existsSync(migrationDir)) return { initialized: false };

  const siteResult = loadSite(join(migrationDir, "SITE.md"));
  if (!siteResult.valid) {
    throw new Error(`SITE.md is invalid: ${JSON.stringify(siteResult.issues)}`);
  }

  const paths = migrationPaths(targetDir);
  const draftInventory = existsSync(paths.draftInventory)
    ? DraftInventorySchema.parse(readJson(paths.draftInventory))
    : null;
  const draftHash = draftInventory ? hashArtifact(draftInventory) : null;
  const approvedInventory = existsSync(paths.approvedInventory)
    ? ApprovedInventorySchema.parse(readJson(paths.approvedInventory))
    : null;
  const inventory = inventoryStatus({ draftHash, approvedInventory });
  const components = approvedInventory
    ? approvedInventory.entries.map(entry => componentApprovalStatus({
      targetDir,
      entry,
      artifactVersion: approvedInventory.artifactVersion,
      forceStale: inventory === "stale",
    }))
    : [];
  const componentStatusByGroup = new Map(
    components.map(component => [component.componentGroupId, component.status]),
  );

  return {
    initialized: true,
    sourceUrl: siteResult.site.sourceUrl,
    inputMode: siteResult.site.inputMode,
    draftInventory: draftInventoryStatus(draftInventory),
    approvals: {
      inventory,
      components,
      pages: pageApprovalStatuses({
        targetDir,
        artifactVersion: approvedInventory?.artifactVersion,
        componentStatusByGroup,
      }),
    },
    queueConcurrency: loadQueueConfig(targetDir).concurrency,
  };
}

function inventoryStatus(args: {
  draftHash: string | null;
  approvedInventory: { artifactVersion: string; staleSince?: string } | null;
}): "approved" | "draft" | "stale" {
  if (!args.approvedInventory) return "draft";
  if (args.approvedInventory.staleSince) return "stale";
  if (args.draftHash && args.approvedInventory.artifactVersion !== args.draftHash) return "stale";
  return "approved";
}

function draftInventoryStatus(draftInventory: DraftInventory | null): DraftInventoryStatus | null {
  if (!draftInventory) return null;
  return {
    revision: draftInventory.revision,
    hash: hashArtifact(draftInventory),
    blockingNames: draftInventory.entries
      .map(entry => entry.proposedName)
      .filter(isBlockingName),
  };
}

function componentApprovalStatus(args: {
  targetDir: string;
  entry: ApprovedInventoryEntry;
  artifactVersion: string;
  forceStale: boolean;
}): ComponentApprovalStatus {
  if (args.forceStale) {
    return componentStatus(args.entry, "stale");
  }

  const approvalPath = migrationPaths(args.targetDir).componentApproval(args.entry.componentGroupId);
  if (!existsSync(approvalPath)) {
    return componentStatus(args.entry, "pending");
  }

  const approval = ComponentBatchApprovalSchema.parse(readJson(approvalPath));
  const componentIndex = approval.componentGroupIds.indexOf(args.entry.componentGroupId);
  if (
    approval.staleSince ||
    approval.artifactVersion !== args.artifactVersion ||
    componentIndex < 0 ||
    approval.implementationNames[componentIndex] !== args.entry.implementationName
  ) {
    return componentStatus(args.entry, "stale");
  }
  return componentStatus(args.entry, "approved");
}

function componentStatus(
  entry: ApprovedInventoryEntry,
  status: ApprovalSummaryStatus,
): ComponentApprovalStatus {
  return {
    componentGroupId: entry.componentGroupId,
    implementationName: entry.implementationName,
    status,
  };
}

function pageApprovalStatuses(args: {
  targetDir: string;
  artifactVersion: string | undefined;
  componentStatusByGroup: Map<string, ApprovalSummaryStatus>;
}): PageApprovalStatus[] {
  const approvalsDir = join(args.targetDir, ".migration", "approvals", "pages");
  if (!existsSync(approvalsDir)) return [];
  return readdirSync(approvalsDir)
    .filter(fileName => fileName.endsWith(".json"))
    .sort()
    .map(fileName => PageLayoutApprovalSchema.parse(readJson(join(approvalsDir, fileName))))
    .map(approval => ({
      slug: approval.slug,
      componentGroupIds: approval.componentGroupIds,
      status: approval.staleSince ||
        approval.artifactVersion !== args.artifactVersion ||
        approval.componentGroupIds.some(groupId => args.componentStatusByGroup.get(groupId) !== "approved")
        ? "stale" as const
        : "approved" as const,
    }));
}

function isBlockingName(name: string): boolean {
  return !/^[A-Z][A-Za-z0-9]*$/.test(name) ||
    /^(?:Component\d+|Section\d+)$/.test(name) ||
    /(?:p\d+-s\d+|P\d+S\d+)/.test(name);
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv.includes("--target")
    ? process.argv[process.argv.indexOf("--target") + 1]
    : process.cwd();
  getStatus(target).then(status => {
    console.log(JSON.stringify(status, null, 2));
  }).catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
