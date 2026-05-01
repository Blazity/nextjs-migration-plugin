# Phase 2 (Analyze) — pitfalls

## Algorithmic pass vs LLM refinement — dual-mode

`lib/analyze.ts` runs the **algorithmic first-pass only**: section probe → Jaccard clustering → split into layouts vs components → `buildRoutes`. Output passes the Zod schema gate but components carry placeholder names (`Div`, `Section`) and big mixed-content clusters dominate.

The four sub-agents (`layout-extractor`, `component-deduper`, `prop-classifier`, `route-mapper`) refine that output. They are **dispatched by the `/migrate:analyze` skill**, not invoked by `lib/analyze.ts`. The skill flow is:

1. `tsx lib/analyze.ts ...` — algorithmic pass (writes `library/*.json` + `analysis/*.json`)
2. Skill dispatches the 4 agents in order, each rewriting its target library JSON in place
3. `tsx lib/analyze.ts ... --refine-only` — re-runs the gate without re-doing probe/cluster

`/migrate:continue` MUST route phase-2 to the `/migrate:analyze` skill, NOT to `lib/continue.ts`'s `defaultDispatchers["phase-2-analyze"]`. The latter runs only step 1 (algorithmic) and produces placeholder component names. See `skills/migrate-continue/SKILL.md` Step 2 routing table.

**Rule of thumb:** if `library/components.json` has names like `Div`, `Section`, `Header` — only step 1 ran. Re-invoke `/migrate:analyze` to fire the LLM refinement.

## Section probe

- **Adapter selector mismatch.** The probe selector comes from the matched adapter's `sectionDiscovery.selector` (or `sectionDiscovery.primarySelector` on real-world adapters). Webflow uses `body > *`; Wix uses `#PAGES_CONTAINER .wixui-section`. If clusters are huge mega-sections, the selector is too coarse — refine the adapter, not the analyze code.
- **Hidden / collapsed elements.** `getBoundingClientRect()` returns 0×0 for `display: none` elements. The probe currently keeps zero-height sections; the cluster step is unaffected (similarity is structural), but downstream agents may want to filter them.
- **JS-rendered sections.** Probe waits for `domcontentloaded` only. Sites that mount sections post-DCL produce sparse output — the LLM-refinement step cannot recover what wasn't probed. Workaround: bump the wait or extend the adapter's `spaContainerHints`.

## Clustering

- **Threshold tuning.** `autoMergeThreshold = 0.85` and `ambiguousThreshold = 0.6` are conservative. Lower autoMerge causes false merges (a `Hero` and a `CallToAction` become one component); raise it past 0.95 and almost nothing clusters.
- **Path shingles vs full DOM trees.** The algorithm uses N-gram path shingles, not real tree-edit distance. Two sections with similar tag paths but very different content can match. The LLM-refinement step (`component-deduper`) is what catches this.
- **Cluster IDs are signature-derived.** Re-running on the same crawl yields the same cluster IDs. Re-running after a probe re-crawl that changed the DOM produces NEW IDs — that's by design; downstream `pages/[slug]/component-usage.json` (Phase 4+) must re-resolve.

## Routes

- **Threshold for `[slug]` promotion.** The current implementation collapses sibling URL groups of size ≥ 3. A 2-page case-study set will stay as two static routes. Raise the threshold for sites with many short-tail patterns; lower it for sites with many similar long-tail clusters.
- **Trailing slashes.** `/case-study/cookunity/` and `/case-study/cookunity` are NOT collapsed by the route mapper — Phase 1's crawler should already have normalized them, but if it didn't, the mapper sees them as two distinct URLs and may demote a [slug] group below threshold.
- **Locale prefixes.** v1 treats `/en/foo` and `/fr/foo` as distinct paths. They will produce two static routes, not a `[locale]/foo` dynamic. v2 candidate.

## Library

- **`HISTORY.md` is append-only.** Never rewrite. Each Phase 2 run appends one entry. Polish runs that don't touch the library still write a "no library changes" entry for audit traceability.
- **`layouts.json` slots can be `null`.** A site with no `<footer>` legitimately produces `footer: null`. Downstream Phase 5 must treat null as "skip this layout slot," not "use a default".
- **`props.json` empties are normal for v1.** Phase 2 ships interface stubs (`fields: []`). Phase 5 (Build) is responsible for filling the prop fields once it has full extracted specs.

## Gate

- **Page-coverage gate is exact.** Every URL in `crawl.json` MUST have a `routes.json` entry. If you've manually trimmed `crawl.json` post-Phase-1, re-run `/migrate:analyze` so routes match.
- **Section-coverage gate ignores empty pages.** A page that probed zero sections (e.g., a 404 the crawler stored) still passes — there are no sections to account for. That's intentional; Phase 4 will skip empty-section pages anyway.
- **`VERIFICATION.md` is never written when `passed: false`.** The presence of `VERIFICATION.md` is the system's only signal that the gate passed; do not write it by hand.
