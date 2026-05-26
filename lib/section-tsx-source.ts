import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";
import { readGeneratedIndex } from "./generated-index.ts";

export interface SectionTsxSource {
  sectionInstanceId: string;
  slug: string;
  sourcePath: string;
  tsx: string;
}

export function resolveSectionTsxSource(args: {
  targetDir: string;
  evidence: RawDiscoveryEvidence;
  sectionInstanceId: string;
}): SectionTsxSource | null {
  const located = findSectionInstance(args.evidence, args.sectionInstanceId);
  if (!located) return null;
  const slug = slugForUrl(args.evidence, located.url);
  if (!slug) return null;
  const generatedDir = join(args.targetDir, ".migration/pages", slug, "generated");
  const picked = pickSectionTsxForMember({
    generatedDir,
    sectionId: args.sectionInstanceId,
  });
  if (!picked) return null;
  return {
    sectionInstanceId: args.sectionInstanceId,
    slug,
    sourcePath: picked.path,
    tsx: picked.tsx,
  };
}

export function pickSectionTsxForMember(args: {
  generatedDir: string;
  sectionId: string;
}): { path: string; tsx: string } | null {
  if (!existsSync(args.generatedDir)) return null;

  // Prefer an explicit `sectionInstanceId → filename` manifest written by
  // the generator(s). This is the only reliable mapping when `generated/`
  // contains files from more than one emitter, since alphabetical sort
  // interleaves their numbering schemes (see docs/issues/003).
  const index = readGeneratedIndex(args.generatedDir);
  if (index && index[args.sectionId]) {
    const file = join(args.generatedDir, index[args.sectionId]);
    if (existsSync(file)) {
      return { path: file, tsx: readFileSync(file, "utf8") };
    }
  }

  // Fallback for legacy state directories (and test fixtures) that pre-date
  // the manifest. Filter to a single naming scheme to avoid the interleaving
  // bug: prefer the discovery-aligned `NN-section.tsx` stubs, then fall back
  // to `.generated.jsx`. Only ever apply the index lookup inside a single
  // scheme.
  const allFiles = readdirSync(args.generatedDir);
  const stubFiles = allFiles.filter(file => /^\d+-section\.tsx$/.test(file)).sort();
  const richFiles = allFiles.filter(file => file.endsWith(".generated.jsx")).sort();
  const candidatePool = stubFiles.length > 0 ? stubFiles : richFiles;
  if (candidatePool.length === 0) return null;

  const matchIndex = Number(args.sectionId.split("-s")[1]);
  if (!Number.isInteger(matchIndex) || matchIndex < 0) return null;
  // Stub filenames are 1-indexed (`01-section.tsx` is `pN-s0`). Adjust.
  const lookupIndex = candidatePool === stubFiles ? matchIndex : matchIndex;
  const file = candidatePool[lookupIndex] ?? candidatePool[matchIndex];
  if (!file) return null;
  const path = join(args.generatedDir, file);
  return {
    path,
    tsx: readFileSync(path, "utf8"),
  };
}

function findSectionInstance(
  evidence: RawDiscoveryEvidence,
  sectionInstanceId: string,
): { url: string } | null {
  for (const [pageIndex, page] of evidence.pages.entries()) {
    if (page.sections.some((section, sectionIndex) =>
      section.id === sectionInstanceId || `p${pageIndex}-s${sectionIndex}` === sectionInstanceId
    )) {
      return { url: page.url };
    }
  }
  return null;
}

function slugForUrl(evidence: RawDiscoveryEvidence, url: string): string | null {
  return evidence.referenceScreenshots.pages.find(reference => reference.url === url)?.slug ?? null;
}
