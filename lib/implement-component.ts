import { createHash } from "node:crypto";
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

  const componentPath = join(args.targetDir, entry.filePath);
  const storyPath = join(
    dirname(componentPath),
    `${entry.implementationName}.stories.tsx`,
  );

  // Skip-flagged groups (Webflow plumbing the decider marked as
  // do-not-codify) get a null-rendering placeholder. The component
  // still exists so page-assembly imports resolve cleanly, but no
  // Storybook story is written — Storybook shouldn't display plumbing
  // that exists only to satisfy unresolved imports. See docs/issues/004.
  if (entry.emit === "skip") {
    ensureWritableArtifacts({
      paths: [componentPath],
      writePolicy: args.writePolicy ?? "error-if-exists",
    });
    mkdirSync(dirname(componentPath), { recursive: true });
    writeFileSync(componentPath, renderSkippedComponentModule(entry.implementationName));
    return {
      componentPath,
      storyPath,
      sectionInstanceIds: entry.sectionInstanceIds,
    };
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

  ensureWritableArtifacts({
    paths: [componentPath, storyPath],
    writePolicy: args.writePolicy ?? "error-if-exists",
  });

  // Dedupe identical sources. A shared shell (SiteHeader, SiteFooter)
  // legitimately appears on multiple pages with identical tsx — emitting
  // `SiteHeaderVariant2`, `SiteHeaderVariant3` for byte-identical copies
  // pollutes the API surface and confuses pixel-diff verification. Only
  // genuine divergences should produce a Variant. See docs/issues/004.
  //
  // Variant suffixes are an opaque ordinal (`Variant2`, `Variant3`).
  // We previously derived them from page slugs (`SiteHeaderPricing`) but
  // page-tied names get unreadable on sites with many pages and force the
  // consumer to track which slug each variant came from. Semantic naming
  // belongs to a later LLM pass over the diff — left for a follow-up.
  const dedup = deduplicateSectionSources({
    implementationName: entry.implementationName,
    sectionInstanceIds: entry.sectionInstanceIds,
    sources: sectionSources.map(source => source.tsx),
  });

  mkdirSync(dirname(componentPath), { recursive: true });
  writeFileSync(
    componentPath,
    renderComponentModule(dedup.uniqueExports.map((entry, index) => ({
      raw: entry.raw,
      name: entry.name,
      exportKind: index === 0 ? "default" : "named",
    }))),
  );
  writeFileSync(
    storyPath,
    renderComponentStories({
      implementationName: entry.implementationName,
      sectionInstanceIds: entry.sectionInstanceIds,
      exportNameBySectionInstanceId: dedup.exportNameBySectionInstanceId,
    }),
  );

  return {
    componentPath,
    storyPath,
    sectionInstanceIds: entry.sectionInstanceIds,
  };
}

interface DeduplicateSectionSourcesArgs {
  implementationName: string;
  sectionInstanceIds: string[];
  sources: string[];
}

interface DeduplicateSectionSourcesResult {
  uniqueExports: Array<{ name: string; raw: string }>;
  exportNameBySectionInstanceId: Record<string, string>;
}

interface DedupBucket {
  hash: string;
  raw: string;
  sectionInstanceIds: string[];
  ordinal: number;
}

export function deduplicateSectionSources(
  args: DeduplicateSectionSourcesArgs,
): DeduplicateSectionSourcesResult {
  const buckets = new Map<string, DedupBucket>();

  // Group section instances by source hash, preserving the order of first
  // appearance so the default export remains stable.
  args.sectionInstanceIds.forEach((sectionInstanceId, index) => {
    const raw = args.sources[index];
    const hash = hashNormalizedTsx(raw);
    const existing = buckets.get(hash);
    if (existing) {
      existing.sectionInstanceIds.push(sectionInstanceId);
    } else {
      buckets.set(hash, {
        hash,
        raw,
        sectionInstanceIds: [sectionInstanceId],
        ordinal: buckets.size,
      });
    }
  });

  const uniqueExports: Array<{ name: string; raw: string }> = [];
  const exportNameBySectionInstanceId: Record<string, string> = {};
  for (const bucket of buckets.values()) {
    const exportName = bucket.ordinal === 0
      ? args.implementationName
      : `${args.implementationName}Variant${bucket.ordinal + 1}`;
    uniqueExports.push({ name: exportName, raw: bucket.raw });
    for (const id of bucket.sectionInstanceIds) {
      exportNameBySectionInstanceId[id] = exportName;
    }
  }

  return { uniqueExports, exportNameBySectionInstanceId };
}

function hashNormalizedTsx(raw: string): string {
  let stripped = raw
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*\n/g, "\n");
  // Webflow inserts cosmetically-empty `<div></div>` wrappers in random
  // spots across pages (animation slots, grid spacers, conditional
  // placeholders). They add no rendered content but make byte-different
  // copies of otherwise-identical components hash-different and emit as
  // spurious variants. Iterate until no more empty containers remain so
  // chains of nested empties collapse together. See docs/issues/004.
  const containerTags = "(?:div|span)";
  const emptyPair = new RegExp(`<${containerTags}\\b[^>]*>\\s*<\\/(?:div|span)>\\s*`, "g");
  const selfClosed = new RegExp(`<${containerTags}\\b[^/>]*\\/>\\s*`, "g");
  let prev: string;
  do {
    prev = stripped;
    stripped = stripped.replace(emptyPair, "");
    stripped = stripped.replace(selfClosed, "");
  } while (stripped !== prev);
  stripped = stripped.replace(/\s+/g, " ").trim();
  return createHash("sha256").update(stripped).digest("hex");
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

function renderSkippedComponentModule(name: string): string {
  return `// This component was flagged by the migration inventory as Webflow
// plumbing (empty wrapper, CSS hoist, or layout-only spacer). It exists
// so page-assembly imports resolve, but renders nothing. Delete the
// reference at the call site once you've confirmed it's safe to drop.
export default function ${name}() {
  return null;
}
`;
}
