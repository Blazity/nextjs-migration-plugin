import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DraftInventorySchema, type DraftInventory } from "../schemas/draft-inventory.ts";
import { RawDiscoveryEvidenceSchema } from "../schemas/raw-discovery.ts";
import type { InventoryCorrection } from "../schemas/inventory-correction.ts";
import { applyCorrections } from "./apply-inventory-corrections.ts";
import { hashArtifact } from "./artifact-hash.ts";
import { renderInventoryReviewHtml } from "./inventory-review-html.ts";
import { recordMigrationDecision } from "./migration-decision-journal.ts";
import { migrationPaths } from "./migration-paths.ts";
import { appendSessionLog } from "./session-log.ts";

export interface RegenerateInventoryArtifactsArgs {
  targetDir: string;
  corrections: InventoryCorrection[];
  userFeedback?: string;
}

export interface RegenerateInventoryArtifactsResult {
  artifactVersion: string;
  draftInventoryPath: string;
  reviewHtmlPath: string;
  blockingNames: string[];
}

const blockingNamePattern = /^(?:Component\d+|Section\d+|UnnamedGroup\d+|P\d+S\d+)$|p\d+-s\d+/;

export function regenerateInventoryArtifacts(
  args: RegenerateInventoryArtifactsArgs,
): RegenerateInventoryArtifactsResult {
  const paths = migrationPaths(args.targetDir);
  const draftInventory = DraftInventorySchema.parse(JSON.parse(readFileSync(paths.draftInventory, "utf8")));
  const evidence = RawDiscoveryEvidenceSchema.parse(JSON.parse(readFileSync(paths.rawDiscovery, "utf8")));
  const beforeArtifactVersion = hashArtifact(draftInventory);
  const updatedDraft = DraftInventorySchema.parse(applyCorrections(draftInventory, args.corrections));
  const afterArtifactVersion = hashArtifact(updatedDraft);
  const reviewHtml = renderInventoryReviewHtml({ draftInventory: updatedDraft, evidence });

  mkdirSync(dirname(paths.draftInventory), { recursive: true });
  writeFileSync(paths.draftInventory, `${JSON.stringify(updatedDraft, null, 2)}\n`);
  writeFileSync(paths.reviewHtml, reviewHtml);
  if (args.userFeedback) {
    appendSessionLog({
      targetDir: args.targetDir,
      title: "inventory: chat feedback",
      body: `feedback:\n${args.userFeedback}\n\ncorrections:\n${JSON.stringify(args.corrections, null, 2)}\n\nbeforeArtifactVersion: ${beforeArtifactVersion}\nafterArtifactVersion: ${afterArtifactVersion}\nreviewHtmlPath: ${paths.reviewHtml}`,
    });
  }
  recordMigrationDecision({
    targetDir: args.targetDir,
    kind: "inventory-correction",
    actor: "llm",
    summary: "Updated draft inventory from chat feedback",
    artifactVersion: afterArtifactVersion,
    userFeedback: args.userFeedback,
    details: {
      beforeArtifactVersion,
      afterArtifactVersion,
      corrections: args.corrections,
      revision: updatedDraft.revision,
      blockingNames: blockingNames(updatedDraft),
    },
  });

  return {
    artifactVersion: afterArtifactVersion,
    draftInventoryPath: paths.draftInventory,
    reviewHtmlPath: paths.reviewHtml,
    blockingNames: blockingNames(updatedDraft),
  };
}

function blockingNames(draftInventory: DraftInventory): string[] {
  return draftInventory.entries
    .map(entry => entry.proposedName)
    .filter(name => blockingNamePattern.test(name));
}
