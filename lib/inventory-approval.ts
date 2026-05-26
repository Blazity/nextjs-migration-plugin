import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ApprovedInventorySchema, type ApprovedInventory } from "../schemas/approved-inventory.ts";
import { DraftInventorySchema, type DraftInventory } from "../schemas/draft-inventory.ts";
import { detectAppRouterRoot } from "./app-router-root.ts";
import { hashArtifact } from "./artifact-hash.ts";
import { recordMigrationDecision } from "./migration-decision-journal.ts";
import { migrationPaths } from "./migration-paths.ts";

export type ApproveDraftInventoryArgs = Readonly<{
  targetDir: string;
  draftInventory: DraftInventory;
  approvedAt?: string;
  userNotes?: string;
}>;

export type ApproveDraftInventoryResult =
  | Readonly<{
      ok: true;
      approvedInventory: ApprovedInventory;
      approvedInventoryPath: string;
      artifactVersion: string;
    }>
  | Readonly<{
      ok: false;
      reason: "blocking-names";
      names: string[];
    }>;

const blockingNamePattern = /^(?:Component\d+|Section\d+|UnnamedGroup\d+|P\d+S\d+)$|p\d+-s\d+/;
const approvedNamePattern = /^[A-Z][A-Za-z0-9]*$/;

export async function approveDraftInventory(args: ApproveDraftInventoryArgs): Promise<ApproveDraftInventoryResult> {
  const draftInventory = DraftInventorySchema.parse(args.draftInventory);
  const blockingNames = draftInventory.entries
    .map(entry => entry.proposedName)
    .filter(name => blockingNamePattern.test(name) || !approvedNamePattern.test(name));

  if (blockingNames.length > 0) {
    return {
      ok: false,
      reason: "blocking-names",
      names: blockingNames,
    };
  }

  const approvedInventoryPath = migrationPaths(args.targetDir).approvedInventory;
  const artifactVersion = hashArtifact(draftInventory);
  const existingApproval = readExistingApproval(approvedInventoryPath);

  if (existingApproval?.artifactVersion === artifactVersion) {
    if (existingApproval.staleSince) {
      const refreshedApproval = withUserNotes(existingApproval, args.userNotes);
      delete refreshedApproval.staleSince;
      writeApprovedInventory(approvedInventoryPath, refreshedApproval);
      recordApprovalDecision(args.targetDir, refreshedApproval, args.userNotes);
      return {
        ok: true,
        approvedInventory: refreshedApproval,
        approvedInventoryPath,
        artifactVersion,
      };
    }
    const refreshedApproval = withUserNotes(existingApproval, args.userNotes);
    if (refreshedApproval !== existingApproval) {
      writeApprovedInventory(approvedInventoryPath, refreshedApproval);
      recordApprovalDecision(args.targetDir, refreshedApproval, args.userNotes);
      return {
        ok: true,
        approvedInventory: refreshedApproval,
        approvedInventoryPath,
        artifactVersion,
      };
    }
    return {
      ok: true,
      approvedInventory: existingApproval,
      approvedInventoryPath,
      artifactVersion,
    };
  }

  // Resolve the components directory against the project's actual App
  // Router root so emitted files land next to a layout that imports them.
  // See docs/issues/008.
  const router = detectAppRouterRoot(args.targetDir);
  const approvedInventory = ApprovedInventorySchema.parse({
    approvedAt: args.approvedAt ?? new Date().toISOString(),
    artifactVersion,
    userNotes: args.userNotes,
    entries: draftInventory.entries.map(entry => ({
      ...entry,
      // Default `render`. The inventory-decider sets `emit: "skip"` on
      // Webflow plumbing groups (style hoists, empty spacers). See
      // docs/issues/004.
      emit: entry.emit ?? "render",
      implementationName: entry.proposedName,
      filePath: `${router.componentsDir}/${entry.proposedName}.tsx`,
    })),
  });

  writeApprovedInventory(approvedInventoryPath, approvedInventory);
  recordApprovalDecision(args.targetDir, approvedInventory, args.userNotes);

  return {
    ok: true,
    approvedInventory,
    approvedInventoryPath,
    artifactVersion,
  };
}

function withUserNotes(
  approvedInventory: ApprovedInventory,
  userNotes: string | undefined,
): ApprovedInventory {
  if (userNotes === undefined || approvedInventory.userNotes === userNotes) {
    return approvedInventory;
  }
  return ApprovedInventorySchema.parse({
    ...approvedInventory,
    userNotes,
  });
}

function recordApprovalDecision(
  targetDir: string,
  approvedInventory: ApprovedInventory,
  userNotes: string | undefined,
): void {
  recordMigrationDecision({
    targetDir,
    kind: "component-inventory-approval",
    actor: "user",
    summary: "Approved Component Inventory Review",
    artifactVersion: approvedInventory.artifactVersion,
    userNotes,
    details: {
      approvedAt: approvedInventory.approvedAt,
      componentGroupIds: approvedInventory.entries.map(entry => entry.componentGroupId),
      implementationNames: approvedInventory.entries.map(entry => entry.implementationName),
    },
  });
}

function writeApprovedInventory(path: string, approvedInventory: ApprovedInventory): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(approvedInventory, null, 2)}\n`);
}

function readExistingApproval(approvedInventoryPath: string): ApprovedInventory | undefined {
  if (!existsSync(approvedInventoryPath)) {
    return undefined;
  }

  return ApprovedInventorySchema.parse(JSON.parse(readFileSync(approvedInventoryPath, "utf8")));
}
