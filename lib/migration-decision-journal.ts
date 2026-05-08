import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { MigrationDecisionSchema, type MigrationDecision } from "../schemas/migration-decision.ts";
import { migrationPaths } from "./migration-paths.ts";

export type RecordMigrationDecisionArgs = Omit<MigrationDecision, "id" | "createdAt"> & {
  targetDir: string;
  createdAt?: string;
};

export function recordMigrationDecision(args: RecordMigrationDecisionArgs): MigrationDecision {
  const createdAt = args.createdAt ?? new Date().toISOString();
  const baseId = decisionId({
    kind: args.kind,
    createdAt,
    summary: args.summary,
    userFeedback: args.userFeedback,
    userNotes: args.userNotes,
    artifactVersion: args.artifactVersion,
  });
  const id = nextDecisionId(args.targetDir, baseId);
  const decision = MigrationDecisionSchema.parse({
    id,
    kind: args.kind,
    actor: args.actor,
    createdAt,
    summary: args.summary,
    artifactVersion: args.artifactVersion,
    userFeedback: args.userFeedback,
    userNotes: args.userNotes,
    details: args.details,
  });
  const path = migrationPaths(args.targetDir).decision(id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(decision, null, 2)}\n`);
  return decision;
}

function nextDecisionId(targetDir: string, baseId: string): string {
  const paths = migrationPaths(targetDir);
  let id = baseId;
  let index = 2;
  while (existsSync(paths.decision(id))) {
    id = `${baseId}-${index}`;
    index++;
  }
  return id;
}

function decisionId(input: Record<string, unknown>): string {
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 8);
  const createdAt = String(input.createdAt).replace(/[^0-9A-Za-z]+/g, "-").replace(/^-|-$/g, "");
  return `${createdAt}-${input.kind}-${hash}`;
}
