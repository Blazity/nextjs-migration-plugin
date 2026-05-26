import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SiteFrontmatterSchema, type SiteFrontmatterInput } from "../schemas/site.ts";
import type { RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";
import { hashArtifact } from "./artifact-hash.ts";
import { bootstrapMigration } from "./bootstrap.ts";
import { runDiscoveryV2, type DiscoveryV2Result } from "./discovery-v2.ts";
import { writeGeneratedIndex, type GeneratedIndex } from "./generated-index.ts";
import { buildDraftInventory } from "./inventory-builder.ts";
import { renderInventoryReviewHtml } from "./inventory-review-html.ts";
import { migrationPaths } from "./migration-paths.ts";
import { ensureStorybookScaffold } from "./storybook-scaffold.ts";
import { urlToSlug } from "./slug.ts";

export interface RunMigrationStartArgs {
  targetDir: string;
  sourceUrl: string;
  inputMode: "url-only" | "url-plus-repo";
  sourceRepo?: string;
  initialPageSelection?: string[];
  discoveryRunner?: (args: {
    targetDir: string;
    sourceUrl: string;
  }) => Promise<DiscoveryV2Result>;
  generatedAt?: () => string;
}

export interface OutcomeReadyForReview {
  kind: "ready-for-review";
  targetDir: string;
  draftInventoryPath: string;
  reviewHtmlPath: string;
  artifactVersion: string;
}

export async function runMigrationStart(
  args: RunMigrationStartArgs,
): Promise<OutcomeReadyForReview> {
  const site = SiteFrontmatterSchema.parse({
    sourceUrl: args.sourceUrl,
    target: "./",
    inputMode: args.inputMode,
    sourceRepo: args.sourceRepo,
    initialPageSelection: args.initialPageSelection,
  } satisfies SiteFrontmatterInput);

  await bootstrapMigration({ targetDir: args.targetDir, site });
  ensureStorybookScaffold(args.targetDir);

  const discovery = await (args.discoveryRunner ?? runDiscoveryV2)({
    targetDir: args.targetDir,
    sourceUrl: args.sourceUrl,
    initialPageSelection: args.initialPageSelection,
  });
  const evidence = discovery.evidence satisfies RawDiscoveryEvidence;
  writeGeneratedSectionSources(args.targetDir, evidence);
  const draftInventory = buildDraftInventory(evidence, {
    generatedAt: args.generatedAt?.(),
  });
  const paths = migrationPaths(args.targetDir);
  mkdirSync(dirname(paths.draftInventory), { recursive: true });
  writeFileSync(paths.draftInventory, JSON.stringify(draftInventory, null, 2));
  writeFileSync(paths.reviewHtml, renderInventoryReviewHtml({ draftInventory, evidence }));

  return {
    kind: "ready-for-review",
    targetDir: args.targetDir,
    draftInventoryPath: paths.draftInventory,
    reviewHtmlPath: paths.reviewHtml,
    artifactVersion: hashArtifact(draftInventory),
  };
}

function writeGeneratedSectionSources(targetDir: string, evidence: RawDiscoveryEvidence): void {
  const slugByUrl = new Map(
    evidence.referenceScreenshots.pages.map(reference => [reference.url, reference.slug]),
  );
  for (const [pageIndex, page] of evidence.pages.entries()) {
    const slug = slugByUrl.get(page.url) ?? urlToSlug(page.url);
    const generatedDir = join(targetDir, ".migration/pages", slug, "generated");
    mkdirSync(generatedDir, { recursive: true });
    const index: GeneratedIndex = {};
    page.sections.forEach((section, sectionIndex) => {
      const sectionInstanceId = `p${pageIndex}-s${sectionIndex}`;
      const fileName = `${String(sectionIndex + 1).padStart(2, "0")}-section.tsx`;
      writeFileSync(join(generatedDir, fileName), renderGeneratedSectionSource({
        sectionInstanceId,
        tagSkeleton: section.tagSkeleton,
        sampleText: section.sampleText,
      }));
      index[sectionInstanceId] = fileName;
    });
    writeGeneratedIndex(generatedDir, index);
  }
}

function renderGeneratedSectionSource(args: {
  sectionInstanceId: string;
  tagSkeleton: string;
  sampleText: string;
}): string {
  const Tag = /^header\b/i.test(args.tagSkeleton)
    ? "header"
    : /^footer\b/i.test(args.tagSkeleton)
      ? "footer"
      : /^nav\b/i.test(args.tagSkeleton)
        ? "nav"
        : "section";
  return `export default function GeneratedSection() {
  return (
    <>
      {/* Source section: ${args.sectionInstanceId} */}
      <${Tag}>
        <p>{${JSON.stringify(args.sampleText)}}</p>
      </${Tag}>
    </>
  );
}
`;
}
