import { join } from "node:path";

export type MigrationViewport = string | number;

export type ComponentReferencePathArgs = Readonly<{
  sectionInstanceId: string;
  viewport: MigrationViewport;
}>;

export type ApprovedBaselinePathArgs = Readonly<{
  kind: "component" | "page";
  slugOrName: string;
  viewport: MigrationViewport;
}>;

export type ApprovedBaselineManifestPathArgs = Readonly<{
  kind: "component" | "page";
  slugOrName: string;
}>;

export function migrationPaths(targetDir: string) {
  const migrationDir = join(targetDir, ".migration");

  return Object.freeze({
    rawDiscovery: join(migrationDir, "discovery", "sections.json"),
    queueConfig: join(migrationDir, "config", "queue.json"),
    draftInventory: join(migrationDir, "inventory", "component-inventory.json"),
    reviewHtml: join(migrationDir, "inventory", "inventory-review.html"),
    decisionsDir: join(migrationDir, "decisions"),
    decision: (decisionId: string) =>
      join(migrationDir, "decisions", `${decisionId}.json`),
    approvedInventory: join(migrationDir, "approvals", "component-inventory.json"),
    componentApproval: (componentId: string) =>
      join(migrationDir, "approvals", "components", `${componentId}.json`),
    pageApproval: (slug: string) =>
      join(migrationDir, "approvals", "pages", `${slug}.json`),
    componentReference: ({ sectionInstanceId, viewport }: ComponentReferencePathArgs) =>
      join(migrationDir, "references", "components", `${sectionInstanceId}-${viewport}.png`),
    approvedBaseline: ({ kind, slugOrName, viewport }: ApprovedBaselinePathArgs) =>
      join(migrationDir, "baselines", baselineKindDir(kind), `${slugOrName}-${viewport}.png`),
    approvedBaselineManifest: ({ kind, slugOrName }: ApprovedBaselineManifestPathArgs) =>
      join(migrationDir, "baselines", baselineKindDir(kind), `${slugOrName}.json`),
  });
}

function baselineKindDir(kind: "component" | "page"): string {
  return kind === "component" ? "components" : "pages";
}
