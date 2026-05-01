# ISSUE-003: layout-extractor heuristic too strict — misses semantic layouts behind generic wrappers

**Surfaced by:** Phase 2 (Analyze)
**Severity:** Medium — produces wrong `layouts.json` on common CMS markup patterns; downstream Phase 5 builds the wrong shell
**Status:** Open

## Evidence pattern

`library/layouts.json` has the wrong cluster in a slot, or has a slot stuck at `null` despite a clear site-wide layout existing. Two sub-shapes of the same root cause:

1. **False positive in `header` slot.** A cluster whose tagSkeleton starts with `header>...` is promoted as the layout `header`, but its sample text reveals it is actually per-page hero copy. Many CMSes (Webflow, Wix, WordPress themes) wrap heroes in `<header>` semantically, distinct from the global site nav.
2. **False negative in `nav` slot.** The site's actual top-level navigation is rendered as a body-level `<div>` (or React/CSS framework wrapper), not `<header>` / `<nav>` / `<footer>`. The cluster appears on every page with identical text (e.g., the same nav links) — but the layout-extractor disqualifies it because the tag prefix does not match.

After running `/migrate:analyze`, inspect `library/components.json`: if the `component-deduper` agent surfaced a cluster with memberCount equal to total page count and sample text that looks navigational (link list + CTA), AND that cluster is named `SiteNav` or similar in `components.json` rather than appearing in `layouts.nav`, this issue is firing.

## Root cause

`extractLayouts` in `lib/analyze.ts` qualifies layout shells by **structural prefix only**:

```ts
if (!c.representative.tagSkeleton.startsWith(prefix)) continue;
```

where `prefix` is one of `"header"`, `"nav"`, `"footer"`. This ignores:

- The cluster's **page-coverage uniqueness** (a cluster present on every crawled page with identical content is almost certainly a layout shell, regardless of tag)
- The cluster's **sample text signal** (link density, CTA presence, repeated copy across pages)
- The cluster's **member count vs. body-direct-child position** (body-level direct children that repeat per page are layout candidates)

Conversely, the prefix check accepts ANY `<header>`-rooted cluster, even when the `<header>` is a per-page page header (i.e., a hero with a heading), not a site header.

## Proposed fix

Replace the prefix-only heuristic with a multi-signal score. Score each cluster against each layout slot, pick the highest scorer above a threshold:

1. **Tag affinity (cheap, current heuristic).** `+2` if `tagSkeleton.startsWith(slot)`, `+1` if the skeleton CONTAINS `<nav>` / `<footer>` as a child anywhere (e.g., `div>div>...,nav>...`), `0` otherwise.
2. **Page-coverage purity.** `+3` if `distinctPages == totalPages`, `+1` if `>= 80%`, `0` if `< 80%`.
3. **Identical sample text across members.** `+2` if all members share the same sampleText prefix (e.g., first 80 chars), `+1` if at least 80% match. Strong layout signal.
4. **Body-level position.** `+1` if the cluster's pathShingles include `body><tag>` and nothing deeper before `<tag>`. Layouts hang off body, components hang off main/article/section.
5. **Slot-specific keywords in sampleText** (single, slot-specific bonus): `+1` for nav if sampleText contains link-list patterns (navigation anchor labels separated by spaces); `+1` for footer if sampleText contains "©", "Privacy", "Terms", "Contact"; `+1` for header if sampleText is a brand name or short tagline.

Slot assignment: for each slot, pick the cluster with the highest score ≥4. If two clusters tie, prefer the one with higher page-coverage purity.

This handles both sub-shapes:
- The Webflow `<header>` cluster carrying per-page hero text scores low on signal 3 (sample text varies wildly across pages) → not promoted to header.
- The body-level `<div>` cluster with identical nav text scores high on signals 2, 3, 4, 5 → promoted to nav even with tag-affinity 0.

The structural-only first pass remains in the algorithmic stage of `lib/analyze.ts` for determinism. The score-based second pass runs in the `layout-extractor` LLM agent if its prompt is upgraded — that agent already has access to sample text per cluster member but its current rules card asks only about tag prefix.

## Two-stage implementation

1. **Lib side (`lib/analyze.ts`):** keep the current strict prefix heuristic but ALSO populate a candidate list per slot — every cluster appearing on ≥80% of pages, regardless of tag. Surface in `analysis/clusters.json` as `layoutCandidates: { header: [...], nav: [...], footer: [...] }` so the agent has a curated input.
2. **Agent side (`agents/layout-extractor.md`):** rewrite the rules card to use the multi-signal score above, drawing on cluster summaries (tagSkeleton + memberIds + sampleText). The agent is the right layer for content-aware decisions per spec § 11.4.

## Action items

- [ ] Add `layoutCandidates` to `clusters.json` shape (any cluster with distinct-page coverage ≥0.8)
- [ ] Update `schemas/sections.ts` (or wherever `clusters.json` is typed) to include `layoutCandidates`
- [ ] Rewrite `agents/layout-extractor.md` rules with the multi-signal scoring rubric
- [ ] Add a regression test in `test/analyze.test.ts`: cluster with `<div>`-prefix tagSkeleton + identical sample text + 100% page coverage → promoted to nav slot when LLM agent runs (or pre-populated as a candidate when only the algorithmic pass runs)
- [ ] Document the dual-pass behavior in `knowledge/phase-pitfalls/analyze.md`
