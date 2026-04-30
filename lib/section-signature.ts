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
}

export function signatureDigest(input: SignatureInput): string {
  const canonical = JSON.stringify({
    tagSkeleton: input.tagSkeleton,
    pathShingles: [...input.pathShingles].sort(),
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}
