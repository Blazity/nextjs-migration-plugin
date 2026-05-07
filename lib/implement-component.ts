import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  renderComponentStories,
  transformOrWrap,
  validateApprovedName,
} from "./component-tsx-emitter.ts";
import { migrationPaths } from "./migration-paths.ts";
import { resolveSectionTsxSource } from "./section-tsx-source.ts";
import { ApprovedInventoryEntrySchema, type ApprovedInventoryEntry } from "../schemas/approved-inventory.ts";
import { RawDiscoveryEvidenceSchema } from "../schemas/raw-discovery.ts";

export interface ImplementComponentArgs {
  targetDir: string;
  entry: ApprovedInventoryEntry;
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

  mkdirSync(dirname(componentPath), { recursive: true });
  writeFileSync(
    componentPath,
    transformOrWrap(sectionSources[0].tsx, entry.implementationName),
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
