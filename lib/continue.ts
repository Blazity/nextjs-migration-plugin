import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ApprovedInventoryEntry } from "../schemas/approved-inventory.ts";
import { scheduleMigration } from "./migration-scheduler.ts";

export type ComponentBatchDispatcher = (args: {
  targetDir: string;
  artifactVersion: string;
  batch: ApprovedInventoryEntry[];
}) => Promise<void>;

export type PageAssemblyDispatcher = (args: {
  targetDir: string;
  slug: string;
  componentGroupIds: string[];
}) => Promise<void>;

export type ResumeResult =
  | { kind: "not-initialized" }
  | { kind: "all-done" }
  | {
      kind: "awaiting-approval";
      approval: "component-inventory";
      artifactVersion: string;
      reviewHtmlPath: string;
    }
  | {
      kind: "approval-stale";
      approval: "component-inventory";
      reason: string;
      reviewHtmlPath: string;
      staleSince?: string;
    }
  | {
      kind: "dispatched";
      action: "implement-component-batch";
      componentGroupIds: string[];
    }
  | {
      kind: "dispatched";
      action: "assemble-page";
      slug: string;
    }
  | {
      kind: "no-dispatcher";
      action: "implement-component-batch";
      artifactVersion: string;
      componentGroupIds: string[];
    }
  | {
      kind: "no-dispatcher";
      action: "assemble-page";
      slug: string;
      componentGroupIds: string[];
    }
  | {
      kind: "blocked";
      reason: string;
    };

export interface ResumeArgs {
  dispatchers?: {
    implementComponentBatch?: ComponentBatchDispatcher;
    assemblePage?: PageAssemblyDispatcher;
  };
}

export async function resumeMigration(
  targetDir: string,
  args: ResumeArgs = {},
): Promise<ResumeResult> {
  if (!existsSync(join(targetDir, ".migration"))) {
    return { kind: "not-initialized" };
  }

  const schedule = scheduleMigration(targetDir);
  switch (schedule.next) {
    case "review-inventory":
      if (schedule.staleApproval) {
        return {
          kind: "approval-stale",
          approval: schedule.staleApproval.approval,
          reason: "Component Inventory Review changed after approval. Re-review the regenerated inventory before continuing.",
          reviewHtmlPath: schedule.reviewHtmlPath,
          staleSince: schedule.staleApproval.staleSince,
        };
      }
      return {
        kind: "awaiting-approval",
        approval: "component-inventory",
        artifactVersion: schedule.artifactVersion,
        reviewHtmlPath: schedule.reviewHtmlPath,
      };
    case "implement-component-batch":
      if (!args.dispatchers?.implementComponentBatch) {
        return {
          kind: "no-dispatcher",
          action: "implement-component-batch",
          artifactVersion: schedule.artifactVersion,
          componentGroupIds: schedule.batch.map(component => component.componentGroupId),
        };
      }
      await args.dispatchers.implementComponentBatch({
        targetDir,
        artifactVersion: schedule.artifactVersion,
        batch: schedule.batch,
      });
      return {
        kind: "dispatched",
        action: "implement-component-batch",
        componentGroupIds: schedule.batch.map(component => component.componentGroupId),
      };
    case "assemble-page":
      if (!args.dispatchers?.assemblePage) {
        return {
          kind: "no-dispatcher",
          action: "assemble-page",
          slug: schedule.slug,
          componentGroupIds: schedule.componentGroupIds,
        };
      }
      await args.dispatchers.assemblePage({
        targetDir,
        slug: schedule.slug,
        componentGroupIds: schedule.componentGroupIds,
      });
      return {
        kind: "dispatched",
        action: "assemble-page",
        slug: schedule.slug,
      };
    case "missing-page-evidence":
      return {
        kind: "blocked",
        reason: schedule.reason,
      };
    case "all-done":
      return { kind: "all-done" };
  }
}

export function defaultDispatchers(): ResumeArgs["dispatchers"] {
  return {};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const get = (flag: string) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const targetDir = get("--target") ?? process.cwd();
  resumeMigration(targetDir, { dispatchers: defaultDispatchers() })
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      if (result.kind === "no-dispatcher") process.exit(2);
    })
    .catch(err => { console.error(err.message); process.exit(1); });
}
