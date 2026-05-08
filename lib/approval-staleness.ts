import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ComponentBatchApprovalSchema, ComponentInventoryApprovalSchema } from "../schemas/approval.ts";
import { ApprovedInventorySchema, type ApprovedInventory } from "../schemas/approved-inventory.ts";
import { DraftInventorySchema, type DraftInventory } from "../schemas/draft-inventory.ts";
import { hashArtifact } from "./artifact-hash.ts";
import { migrationPaths } from "./migration-paths.ts";

export interface CheckApprovalStalenessArgs {
  targetDir: string;
  now?: () => string;
}

export interface ApprovalStalenessResult {
  staleApprovals: string[];
}

export function checkApprovalStaleness(args: CheckApprovalStalenessArgs): ApprovalStalenessResult {
  const paths = migrationPaths(args.targetDir);
  const staleSince = (args.now ?? (() => new Date().toISOString()))();
  const staleApprovals: string[] = [];

  if (!existsSync(paths.draftInventory) || !existsSync(paths.approvedInventory)) {
    return { staleApprovals };
  }

  const draftInventory = DraftInventorySchema.parse(JSON.parse(readFileSync(paths.draftInventory, "utf8")));
  const approvedInventory = readApprovedInventory(paths.approvedInventory, draftInventory);
  const liveArtifactVersion = hashArtifact(draftInventory);

  if (approvedInventory.artifactVersion !== liveArtifactVersion) {
    writeJson(paths.approvedInventory, {
      ...approvedInventory,
      staleSince: approvedInventory.staleSince ?? staleSince,
    });
    staleApprovals.push("component-inventory");
  }

  const changedGroups = changedComponentGroups(approvedInventory, draftInventory);
  const componentApprovalDir = join(args.targetDir, ".migration", "approvals", "components");
  if (changedGroups.size > 0 && existsSync(componentApprovalDir)) {
    for (const fileName of readdirSync(componentApprovalDir)) {
      if (!fileName.endsWith(".json")) continue;
      const approvalPath = join(componentApprovalDir, fileName);
      const approval = ComponentBatchApprovalSchema.parse(JSON.parse(readFileSync(approvalPath, "utf8")));
      if (!approval.componentGroupIds.some(groupId => changedGroups.has(groupId))) {
        continue;
      }
      writeJson(approvalPath, {
        ...approval,
        staleSince: approval.staleSince ?? staleSince,
      });
      staleApprovals.push(`components/${fileName.replace(/\.json$/, "")}`);
    }
  }

  return { staleApprovals };
}

function changedComponentGroups(
  approvedInventory: ApprovedInventory,
  draftInventory: DraftInventory,
): Set<string> {
  const draftEntries = new Map(
    draftInventory.entries.map(entry => [entry.componentGroupId, entry]),
  );
  const changed = new Set<string>();
  for (const approvedEntry of approvedInventory.entries) {
    const draftEntry = draftEntries.get(approvedEntry.componentGroupId);
    if (!draftEntry || approvedEntrySnapshot(approvedEntry) !== draftEntrySnapshot(draftEntry)) {
      changed.add(approvedEntry.componentGroupId);
    }
  }
  return changed;
}

function readApprovedInventory(path: string, draftInventory: DraftInventory): ApprovedInventory {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const approvedInventoryResult = ApprovedInventorySchema.safeParse(raw);
  if (approvedInventoryResult.success) {
    return approvedInventoryResult.data;
  }

  const approvalRecord = ComponentInventoryApprovalSchema.parse(raw);
  const draftEntries = new Map(
    draftInventory.entries.map(entry => [entry.componentGroupId, entry]),
  );
  return ApprovedInventorySchema.parse({
    approvedAt: approvalRecord.approvedAt,
    artifactVersion: approvalRecord.artifactVersion,
    entries: approvalRecord.entries.map(entry => ({
      ...draftEntries.get(entry.componentGroupId),
      componentGroupId: entry.componentGroupId,
      proposedName: entry.implementationName,
      implementationName: entry.implementationName,
      filePath: `src/components/${entry.implementationName}.tsx`,
    })),
  });
}

function approvedEntrySnapshot(entry: ApprovedInventory["entries"][number]): string {
  return JSON.stringify({
    componentGroupId: entry.componentGroupId,
    implementationName: entry.implementationName,
    kind: entry.kind,
    sectionInstanceIds: [...entry.sectionInstanceIds].sort(),
  });
}

function draftEntrySnapshot(entry: DraftInventory["entries"][number]): string {
  return JSON.stringify({
    componentGroupId: entry.componentGroupId,
    implementationName: entry.proposedName,
    kind: entry.kind,
    sectionInstanceIds: [...entry.sectionInstanceIds].sort(),
  });
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
