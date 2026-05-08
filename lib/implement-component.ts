import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  renderComponentModule,
  renderComponentStories,
  validateApprovedName,
} from "./component-tsx-emitter.ts";
import { migrationPaths } from "./migration-paths.ts";
import { resolveSectionTsxSource } from "./section-tsx-source.ts";
import { ApprovedInventoryEntrySchema, type ApprovedInventoryEntry } from "../schemas/approved-inventory.ts";
import { RawDiscoveryEvidenceSchema } from "../schemas/raw-discovery.ts";

export interface ImplementComponentArgs {
  targetDir: string;
  entry: ApprovedInventoryEntry;
  writePolicy?: "error-if-exists" | "overwrite";
}

export interface ImplementComponentResult {
  componentPath: string;
  storyPath: string;
  sectionInstanceIds: string[];
}

export function implementComponent(args: ImplementComponentArgs): ImplementComponentResult {
  const entry = ApprovedInventoryEntrySchema.parse(args.entry);
  const validation = validateApprovedName(entry.implementationName);
  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  const evidence = RawDiscoveryEvidenceSchema.parse(
    JSON.parse(readFileSync(migrationPaths(args.targetDir).rawDiscovery, "utf8")),
  );
  const sectionSources = entry.sectionInstanceIds.map(sectionInstanceId => {
    const source = resolveSectionTsxSource({
      targetDir: args.targetDir,
      evidence,
      sectionInstanceId,
    });
    if (!source) {
      throw new Error(`No generated TSX source found for section instance ${sectionInstanceId}`);
    }
    return source;
  });

  const componentPath = join(args.targetDir, entry.filePath);
  const storyPath = join(
    dirname(componentPath),
    `${entry.implementationName}.stories.tsx`,
  );
  ensureWritableArtifacts({
    paths: [componentPath, storyPath],
    writePolicy: args.writePolicy ?? "error-if-exists",
  });

  mkdirSync(dirname(componentPath), { recursive: true });
  writeFileSync(
    componentPath,
    renderComponentModule(sectionSources.map((source, index) => ({
      raw: source.tsx,
      name: index === 0
        ? entry.implementationName
        : `${entry.implementationName}Variant${index + 1}`,
      exportKind: index === 0 ? "default" : "named",
    }))),
  );
  writeFileSync(
    storyPath,
    renderComponentStories({
      implementationName: entry.implementationName,
      sectionInstanceIds: entry.sectionInstanceIds,
    }),
  );

  return {
    componentPath,
    storyPath,
    sectionInstanceIds: entry.sectionInstanceIds,
  };
}

function ensureWritableArtifacts(args: {
  paths: string[];
  writePolicy: "error-if-exists" | "overwrite";
}): void {
  if (args.writePolicy === "overwrite") return;

  const existing = args.paths.filter(path => existsSync(path));
  if (existing.length > 0) {
    throw new Error(
      `Refusing to overwrite existing component artifact: ${existing.join(", ")}`,
    );
  }
}
