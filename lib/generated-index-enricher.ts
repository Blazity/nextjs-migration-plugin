import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SectionRecord } from "../schemas/sections.ts";
import { readGeneratedIndex, writeGeneratedIndex } from "./generated-index.ts";

/**
 * After `scripts/generate-jsx.ts` has produced the richer
 * `NN-<label>.generated.jsx` files for a page, this enricher walks the
 * spec manifest emitted by `extract-styles` and tries to associate each
 * discovery section (`pN-sM`) with the best-matching `.generated.jsx`.
 * When a confident match exists, the entry in `generated/index.json` is
 * upgraded from the thin stub (`NN-section.tsx`) to the richer file.
 *
 * No match is taken silently — entries without a confident candidate keep
 * their stub mapping, and `pickSectionTsxForMember` still finds them.
 */
export interface EnrichGeneratedIndexArgs {
  generatedDir: string;
  specsDir: string;
  pageSections: SectionRecord[];
  pageIndex: number;
}

interface SpecManifestSection {
  index: number;
  label: string;
  tag: string;
  textPreview?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  structureFile: string;
  stylesFile: string;
}

interface SpecManifest {
  sections?: SpecManifestSection[];
}

const MIN_MATCH_SCORE = 4;

export function enrichGeneratedIndex(args: EnrichGeneratedIndexArgs): void {
  const index = readGeneratedIndex(args.generatedDir);
  if (!index) return;

  const manifestPath = join(args.specsDir, "manifest.json");
  if (!existsSync(manifestPath)) return;

  let manifest: SpecManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as SpecManifest;
  } catch {
    return;
  }
  const specSections = Array.isArray(manifest.sections) ? manifest.sections : [];
  if (specSections.length === 0) return;

  // Spec manifest entries can be claimed by only one section instance to
  // avoid collapsing two different cluster members onto the same source.
  const claimed = new Set<number>();

  for (const [sectionIndex, section] of args.pageSections.entries()) {
    const sectionInstanceId = `p${args.pageIndex}-s${sectionIndex}`;
    const best = findBestSpecMatch(section, specSections, claimed);
    if (!best) continue;
    const generatedJsxName = best.structureFile.replace(/\.structure\.md$/, ".generated.jsx");
    const generatedJsxPath = join(args.generatedDir, generatedJsxName);
    if (!existsSync(generatedJsxPath)) continue;
    index[sectionInstanceId] = generatedJsxName;
    claimed.add(best.index);
  }

  writeGeneratedIndex(args.generatedDir, index);
}

function findBestSpecMatch(
  section: SectionRecord,
  candidates: SpecManifestSection[],
  claimed: Set<number>,
): SpecManifestSection | null {
  let bestScore = 0;
  let best: SpecManifestSection | null = null;
  for (const cand of candidates) {
    if (claimed.has(cand.index)) continue;
    const score = scoreMatch(section, cand);
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  return bestScore >= MIN_MATCH_SCORE ? best : null;
}

function scoreMatch(section: SectionRecord, cand: SpecManifestSection): number {
  let score = 0;

  const sectionTag = (section.tagSkeleton.match(/^[a-z0-9]+/i)?.[0] ?? "").toLowerCase();
  const candTag = (cand.tag ?? "").toLowerCase();
  if (sectionTag && candTag && sectionTag === candTag) score += 3;

  if (cand.bounds) {
    const overlap = boundsOverlapRatio(section.boundingBox, cand.bounds);
    if (overlap > 0.7) score += 3;
    else if (overlap > 0.4) score += 1;
  }

  if (section.sampleText && cand.textPreview) {
    // Compare on a whitespace-/punctuation-stripped form so previews like
    // "PRODUCTPricingEnterprise" (extract-styles collapses adjacent text
    // nodes when computing `textContent`) still match the discovery
    // sampleText "PRODUCT Pricing Enterprise …". Without this, footers
    // and other nav-style blocks systematically fall back to stubs.
    const a = normalize(section.sampleText).slice(0, 120);
    const b = normalize(cand.textPreview).slice(0, 120);
    if (a.length >= 12 && b.length >= 12) {
      const shared = sharedPrefix(a, b);
      if (shared >= 24) score += 3;
      else if (shared >= 12) score += 2;
      else if (a.includes(b.slice(0, 20)) || b.includes(a.slice(0, 20))) score += 1;
    }
  }

  return score;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function sharedPrefix(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

function boundsOverlapRatio(
  a: SectionRecord["boundingBox"],
  b: NonNullable<SpecManifestSection["bounds"]>,
): number {
  if (a.height <= 0 && b.height <= 0) return 0;
  const aTop = a.y;
  const aBottom = a.y + a.height;
  const bTop = b.y;
  const bBottom = b.y + b.height;
  const overlap = Math.max(0, Math.min(aBottom, bBottom) - Math.max(aTop, bTop));
  const union = Math.max(aBottom, bBottom) - Math.min(aTop, bTop);
  return union > 0 ? overlap / union : 0;
}
