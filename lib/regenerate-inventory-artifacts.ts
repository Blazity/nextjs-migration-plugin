import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DraftInventorySchema } from "../schemas/draft-inventory.ts";
import { RawDiscoveryEvidenceSchema } from "../schemas/raw-discovery.ts";
import type { InventoryCorrection } from "../schemas/inventory-correction.ts";
import { applyCorrections } from "./apply-inventory-corrections.ts";
import { hashArtifact } from "./artifact-hash.ts";
import { renderInventoryReviewHtml } from "./inventory-review-html.ts";
import { migrationPaths } from "./migration-paths.ts";

export interface RegenerateInventoryArtifactsArgs {
  targetDir: string;
  corrections: InventoryCorrection[];
}

export interface RegenerateInventoryArtifactsResult {
  artifactVersion: string;
  draftInventoryPath: string;
  reviewHtmlPath: string;
  blockingNames: string[];
}

const blockingNamePattern = /^(?:Component\d+|Section\d+)$|p\d+-s\d+/;

export function regenerateInventoryArtifacts(
  args: RegenerateInventoryArtifactsArgs,
): RegenerateInventoryArtifactsResult {
  const paths = migrationPaths(args.targetDir);
  const draftInventory = DraftInventorySchema.parse(JSON.parse(readFileSync(paths.draftInventory, "utf8")));
  const evidence = RawDiscoveryEvidenceSchema.parse(JSON.parse(readFileSync(paths.rawDiscovery, "utf8")));
  const updatedDraft = DraftInventorySchema.parse(applyCorrections(draftInventory, args.corrections));
  const reviewHtml = renderInventoryReviewHtml({ draftInventory: updatedDraft, evidence });

  mkdirSync(dirname(paths.draftInventory), { recursive: true });
  writeFileSync(paths.draftInventory, `${JSON.stringify(updatedDraft, null, 2)}\n`);
  writeFileSync(paths.reviewHtml, reviewHtml);

  return {
    artifactVersion: hashArtifact(updatedDraft),
    draftInventoryPath: paths.draftInventory,
    reviewHtmlPath: paths.reviewHtml,
    blockingNames: updatedDraft.entries
      .map(entry => entry.proposedName)
      .filter(name => blockingNamePattern.test(name)),
  };
}
