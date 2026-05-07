import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ApprovedInventorySchema, type ApprovedInventory } from "../schemas/approved-inventory.ts";
import { DraftInventorySchema, type DraftInventory } from "../schemas/draft-inventory.ts";
import { hashArtifact } from "./artifact-hash.ts";
import { migrationPaths } from "./migration-paths.ts";

export type ApproveDraftInventoryArgs = Readonly<{
  targetDir: string;
  draftInventory: DraftInventory;
  approvedAt?: string;
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

const blockingNamePattern = /^(?:Component\d+|Section\d+)$|p\d+-s\d+/;
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
      const refreshedApproval = { ...existingApproval };
      delete refreshedApproval.staleSince;
      writeApprovedInventory(approvedInventoryPath, refreshedApproval);
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

  const approvedInventory = ApprovedInventorySchema.parse({
    approvedAt: args.approvedAt ?? new Date().toISOString(),
    artifactVersion,
    entries: draftInventory.entries.map(entry => ({
      ...entry,
      implementationName: entry.proposedName,
      filePath: `src/components/${entry.proposedName}.tsx`,
    })),
  });

  writeApprovedInventory(approvedInventoryPath, approvedInventory);

  return {
    ok: true,
    approvedInventory,
    approvedInventoryPath,
    artifactVersion,
  };
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
