# ISSUE-004: Mega-clusters from shallow path-shingles on body-level sections

**Surfaced by:** Phase 2 (Analyze)
**Severity:** High — collapses unrelated content sections (heroes, testimonials, stats, CTAs) into a single bucket; Phase 5 cannot generate distinct components from the result
**Status:** Resolved (f693326)

## Evidence pattern

`runs/<runDir>/phase-2-analyze/analysis/clusters.json` contains a cluster whose `memberCount` is 5-50× larger than any other cluster, with member sections drawn from semantically distinct page regions. Sample text per member ranges across heroes, testimonials, stats blocks, CTA banners, badges. `library/components.json` ends up with one mega-component (commonly named `ContentSection` after LLM refinement) plus 1-2 layout-derived components, regardless of how diverse the source site actually is.

Inspect `clusters.json[i].representative.pathShingles`: if the representative has `pathShingles: ["body>section"]` (a single 2-segment shingle) and `memberCount > 30`, the bug is firing.

## Root cause

`lib/cluster.ts` ran Jaccard similarity over `section.pathShingles` only:

```ts
const sim = jaccard(section.pathShingles, cluster.representative.pathShingles);
```

For body-level sections the path is `["body", "section"]`, length 2. `pathShingles(tags, n=3)` returns `[tags.join(">")]` when `tags.length < n`, so every body-level section produces a single shingle: `"body>section"`.

Jaccard between two singletons that match: `|{x}| / |{x}|` = 1.0. Above the 0.85 auto-merge threshold → all body-level sections collapse into one cluster regardless of internal structure.

The `tagSkeleton` field DID encode internal structure (`section>div>h1,p>button` vs `section>blockquote>p,cite`) but never entered the similarity calculation.

This is exactly the failure mode Webflow / Wix / most marketing-CMS layouts trigger: sections live as direct body children, so path discrimination is impossible without descending into the tag tree.

## Fix (shipped)

Add `tagShingles` + `compositeShingles` helpers to `lib/section-signature.ts`, switch `lib/cluster.ts` to use composite shingles in its similarity calculation.

```ts
// lib/section-signature.ts
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

export function compositeShingles(input: SignatureInput): string[] {
  return [
    ...input.pathShingles.map(s => `p:${s}`),
    ...tagShingles(input.tagSkeleton).map(s => `t:${s}`),
  ];
}
```

```ts
// lib/cluster.ts (inside clusterSections loop)
const sectionShingles = compositeShingles({
  pathShingles: section.pathShingles,
  tagSkeleton: section.tagSkeleton,
});
const clusterShingles = compositeShingles({
  pathShingles: cluster.representative.pathShingles,
  tagSkeleton: cluster.representative.tagSkeleton,
});
const sim = jaccard(sectionShingles, clusterShingles);
```

The `p:` / `t:` prefixes keep the two signal spaces disjoint so a path token never accidentally Jaccard-matches a tag token.

## Why this works

For two body-level sections with identical shallow paths but different internal structure:

| Section | pathShingles | tagSkeleton | composite shingles |
|---|---|---|---|
| Hero | `["body>section"]` | `section>div>h1,p>button` | `p:body>section`, `t:section>div>div`, `t:div>div>h1`, `t:div>h1>p`, `t:h1>p>button` |
| Testimonial | `["body>section"]` | `section>blockquote>p,cite` | `p:body>section`, `t:section>blockquote>p`, `t:blockquote>p>cite` |

Jaccard overlap = 1 (the `p:body>section`) / total 7 = ~0.14. Far below the 0.85 auto-merge threshold → distinct clusters.

Sections with similar internal structure (e.g., two Hero variants on different pages) still match because their `t:` shingles overlap heavily.

## Threshold tuning consequence

The 0.85 / 0.6 thresholds were calibrated for path-only Jaccard. With composite shingles, similarity scores shift downward across the board (the path contribution dilutes when tag shingles are added). Initial blazity.com re-run will indicate whether the existing thresholds still produce sensible clusters or whether they need to drop.

If clusters fragment too aggressively (single-member singletons everywhere), lower `autoMergeThreshold` to ~0.7. If mega-clusters persist, raise the relative weight of `t:` shingles by emitting two `t:` entries per shingle.

## Action items

- [x] Add `tagShingles` + `compositeShingles` to `lib/section-signature.ts`
- [x] Switch `lib/cluster.ts` similarity to composite shingles
- [x] Add unit tests for the new helpers (4 + 3 cases)
- [x] Add cluster test: 5 body-level sections with 3 distinct internal structures → ≥3 clusters
- [ ] Re-run `/migrate:analyze` against the blazity.com fixture, confirm cluster-c282 splits into 5+ sub-clusters
- [ ] Tune thresholds based on the re-run if the default 0.85 produces too many singletons or persistent mega-clusters
