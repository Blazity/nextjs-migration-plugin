import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";

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
  const tsxFiles = readdirSync(args.generatedDir)
    .filter(file => file.endsWith(".tsx") || file.endsWith(".generated.jsx"))
    .sort();
  const matchIndex = Number(args.sectionId.split("-s")[1] ?? "0");
  const file = tsxFiles[matchIndex] ?? tsxFiles[0];
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
  for (const page of evidence.pages) {
    if (page.sections.some(section => section.id === sectionInstanceId)) {
      return { url: page.url };
    }
  }
  return null;
}

function slugForUrl(evidence: RawDiscoveryEvidence, url: string): string | null {
  return evidence.referenceScreenshots.pages.find(reference => reference.url === url)?.slug ?? null;
}
