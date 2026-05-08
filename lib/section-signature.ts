import type { SectionSignals } from "../schemas/sections.ts";
import { createHash } from "node:crypto";

export function pathShingles(tags: string[], n = 3): string[] {
  if (tags.length === 0) return [];
  if (tags.length < n) return [tags.join(">")];
  const out: string[] = [];
  for (let i = 0; i + n <= tags.length; i++) {
    out.push(tags.slice(i, i + n).join(">"));
  }
  return out;
}

/**
 * N-gram windows over the tokens inside a tagSkeleton string.
 *
 * `tagSkeleton` encodes the descendant structure of a section as a string
 * like `"section>div,div>div>div>p,div>img"`. Tokens are tags split on `>`
 * and `,`. The shingle window is run over the flat token sequence so two
 * sections with different child substructure produce different shingles
 * even when their ancestor pathShingles match (e.g., both at body-level).
 *
 * Used in `compositeShingles` to discriminate body-level sections that
 * pathShingles alone would Jaccard-merge into a mega-cluster.
 */
export function tagShingles(tagSkeleton: string, n = 3): string[] {
  const tokens = tagSkeleton.split(/[>,]/).map(t => t.trim()).filter(Boolean);
  if (tokens.length === 0) return [];
  if (tokens.length < n) return [tokens.join(">")];
  const out: string[] = [];
  for (let i = 0; i + n <= tokens.length; i++) {
    out.push(tokens.slice(i, i + n).join(">"));
  }
  return out;
}

/**
 * Combine ancestor-path shingles with descendant-tag shingles into a single
 * disjoint shingle set suitable for Jaccard similarity.
 *
 * Each shingle is namespaced (`p:` for path, `t:` for tag) so a path token
 * never accidentally matches a tag token. Path shingles capture where a
 * section sits in the document; tag shingles capture what the section looks
 * like internally. Sections that share a shallow body-level path but have
 * different internal structure (Hero vs Testimonial vs StatsBlock) end up
 * with diverging composite shingle sets.
 */
export function compositeShingles(input: SignatureInput): string[] {
  return [
    ...weightedShingles("p", input.pathShingles),
    ...weightedShingles("t", tagShingles(input.tagSkeleton)),
    ...signalShingles(input.signals),
  ];
}

function weightedShingles(prefix: "p" | "t", values: string[]): string[] {
  return values.flatMap(value => [
    `${prefix}:${value}`,
    `${prefix}:w2:${value}`,
    `${prefix}:w3:${value}`,
    `${prefix}:w4:${value}`,
  ]);
}

export function signalShingles(signals: Partial<SectionSignals> | undefined): string[] {
  if (!signals) return [];
  return Object.entries(signals)
    .filter((entry) => typeof entry[1] === "string")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `s:${key}=${value}`);
}

export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface SignatureInput {
  tagSkeleton: string;
  pathShingles: string[];
  signals?: Partial<SectionSignals>;
}

export function signatureDigest(input: SignatureInput): string {
  const canonical = JSON.stringify({
    tagSkeleton: input.tagSkeleton,
    pathShingles: [...input.pathShingles].sort(),
    signals: input.signals
      ? Object.fromEntries(Object.entries(input.signals).sort(([left], [right]) => left.localeCompare(right)))
      : undefined,
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}
