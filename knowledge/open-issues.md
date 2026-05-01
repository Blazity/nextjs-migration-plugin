# Open issues — plugin-side bugs surfaced by real-world runs

Running registry of plugin defects observed during phase runs against real sites. Site-specific quirks belong in the user's `.migration/findings/`; entries here are bugs in the plugin's scripts/lib that need fixing in the plugin codebase.

Each entry: severity, phase that surfaced it, evidence pattern, root cause, proposed fix.

---

## ISSUE-001: SPA_FLOW_EXTRACTION misclassified on statically-rendered pages

**Surfaced by:** Phase 1 (Discover)
**Severity:** High — routes static pages through the heavier SPA flow in Phase 4 unnecessarily, multiplying extraction cost and complexity
**Status:** Open

### Evidence pattern

A page is statically rendered (full HTML present in `view-source`, all content visible without JS execution) but the probe still emits `recommendation: "SPA_FLOW_EXTRACTION"`. Cross-check signals:

- `spaAnalysis.isSPA` is `false`
- `spaAnalysis.bodyDirectChildSections` is high (≥4)
- A framework adapter matched definitively
- `contentValidation.fallbackSignals` lists `h1-url-mismatch` and/or `url-content-mismatch`

When all of the above hold, the SPA recommendation is wrong — the page is fine for `DIRECT_EXTRACTION`.

### Root cause

`scripts/lib/probe-analysis.ts`:

```
suspectedFallback = fallbackSignals.length > 0 && hasDetectedFramework
recommendation = suspectedFallback ? "SPA_FLOW_EXTRACTION" : "DIRECT_EXTRACTION"
```

`fallbackSignals` is populated by:

1. `url-content-mismatch` — URL path keywords not found in body text
2. `h1-url-mismatch` — URL path keywords not found in `h1` text
3. `expected-content-missing` — only fires when `--expected-content` is passed

The keyword heuristic conflates two distinct phenomena:

- **A genuine fallback page** — a React SPA shell that hasn't hydrated; the URL says `/products/widget` but the rendered DOM is just a loading skeleton with no widget-related copy.
- **Marketing copy that doesn't echo the URL slug** — a normal CMS page where the URL is `/services/agents` but the h1 is "Production-grade AI agents that ship". Different vocabulary, full content present.

`H1_OPTIONAL_FRAMEWORKS = new Set(["gatsby"])` exempts only Gatsby. Most marketing-site frameworks (Webflow, Wix, Squarespace, Framer, WordPress variants, Next.js static export) routinely produce h1 text that doesn't share keywords with the URL slug — that's a copywriting style, not a fallback signal.

### Proposed fix

Two-part change in `scripts/lib/probe-analysis.ts`. Pick one or do both:

1. **Expand the framework exemption.** Add `webflow`, `wix`, `squarespace`, `framer`, `wordpress` (and variants), and `nextjs` to `H1_OPTIONAL_FRAMEWORKS`. Keep only React-only adapters (`react`, frameworks that ship as pure SPAs) outside the set, since those genuinely render placeholder shells.
2. **Gate `contentMatchesUrl` on body length.** Only treat keyword-absence as a fallback signal when body text is short (e.g., `< 500` chars). Pages with substantial copy never look like fallbacks regardless of slug overlap.

A narrower alternative that sidesteps the heuristic entirely: when `isSPA: false` AND `bodyDirectChildSections >= 4`, force `DIRECT_EXTRACTION` regardless of fallback signals. Body-section count is a stronger truth signal than slug heuristics.

### Action items

- [ ] Decide: framework allowlist, body-content gate, or section-count override (or combination)
- [ ] Patch `scripts/lib/probe-analysis.ts`
- [ ] Add a regression test: a probe input with `hasDetectedFramework: true`, `contentMatchesUrl: false`, `h1MatchesUrl: false`, and a static-marketing-site framework should yield `DIRECT_EXTRACTION`
- [ ] Document the new behavior in `knowledge/phase-pitfalls/discover.md`

---

## ISSUE-002: Duplicate URL entries from un-resolved redirects

**Surfaced by:** Phase 1 (Discover)
**Severity:** Medium — inflates page count, duplicates work in Phases 4-5, may produce conflicting library entries in Phase 2
**Status:** Open

### Evidence pattern

`crawl.json.pages` contains both pre- and post-redirect URLs as distinct entries with `status: 200`. Common shapes:

- Singular vs plural path: `/case-study/X` and `/case-studies/X`
- Trailing-slash variants that the server actually canonicalizes: `/foo/` redirected to `/foo` but both stored
- Old-path-redirected-to-new-path: site moved `/old/foo` to `/new/foo` via 301 but both appear in the crawl

Manual verification of any pair:

```bash
curl -sI https://example.com/duplicate-form | grep -i 'location\|HTTP/'
```

A `301`/`302` with a `Location:` header confirms the redirect; both URLs in `crawl.json` confirms the bug.

### Root cause

`scripts/crawl-site.ts` `normalize()` strips trailing slashes, hash, and query — but the crawler stores `next.url` (the queued URL) in `visited`, not the URL Playwright actually landed on after following redirects. Playwright resolves redirects automatically; `page.url()` reports the final URL. We never read it.

### Proposed fix

In `scripts/crawl-site.ts`, after `page.goto(norm)`:

```ts
const finalUrl = normalize(page.url());  // post-redirect canonical
if (visited.has(finalUrl)) continue;     // collapse to existing entry
visited.set(finalUrl, { /* ...use finalUrl, not norm... */ });
```

Two side effects to handle:

- `outboundLinks` discovered on a redirect-source page may still enqueue the non-canonical form. Dedup at queue-add time too — keep a `seenCanonical: Set<string>` and skip queuing if an equivalent post-normalize URL is already present.
- Slug derivation must use the canonical URL, not the queued one.

### Action items

- [ ] Patch `scripts/crawl-site.ts` to use `page.url()` post-goto and collapse duplicates
- [ ] Add a regression test: crawler against a fixture that 301s `/old` to `/new` records only `/new`, with `discoveredVia` preserved from the original queue entry
- [ ] Decide whether to record the redirect chain in `crawl.json.errors` or as a separate `redirects: []` field for downstream debugging
- [ ] Update `schemas/crawl.ts` if a new field is added

---

## ISSUE-003: layout-extractor heuristic too strict — misses semantic layouts behind generic wrappers

**Surfaced by:** Phase 2 (Analyze)
**Severity:** Medium — produces wrong `layouts.json` on common CMS markup patterns; downstream Phase 5 builds the wrong shell
**Status:** Open

### Evidence pattern

`library/layouts.json` has the wrong cluster in a slot, or has a slot stuck at `null` despite a clear site-wide layout existing. Two sub-shapes of the same root cause:

1. **False positive in `header` slot.** A cluster whose tagSkeleton starts with `header>...` is promoted as the layout `header`, but its sample text reveals it is actually per-page hero copy. Many CMSes (Webflow, Wix, WordPress themes) wrap heroes in `<header>` semantically, distinct from the global site nav.
2. **False negative in `nav` slot.** The site's actual top-level navigation is rendered as a body-level `<div>` (or React/CSS framework wrapper), not `<header>` / `<nav>` / `<footer>`. The cluster appears on every page with identical text (e.g., the same nav links) — but the layout-extractor disqualifies it because the tag prefix does not match.

After running `/migrate:analyze`, inspect `library/components.json`: if the `component-deduper` agent surfaced a cluster with memberCount equal to total page count and sample text that looks navigational (link list + CTA), AND that cluster is named `SiteNav` or similar in `components.json` rather than appearing in `layouts.nav`, this issue is firing.

### Root cause

`extractLayouts` in `lib/analyze.ts` qualifies layout shells by **structural prefix only**:

```ts
if (!c.representative.tagSkeleton.startsWith(prefix)) continue;
```

where `prefix` is one of `"header"`, `"nav"`, `"footer"`. This ignores:

- The cluster's **page-coverage uniqueness** (a cluster present on every crawled page with identical content is almost certainly a layout shell, regardless of tag)
- The cluster's **sample text signal** (link density, CTA presence, repeated copy across pages)
- The cluster's **member count vs. body-direct-child position** (body-level direct children that repeat per page are layout candidates)

Conversely, the prefix check accepts ANY `<header>`-rooted cluster, even when the `<header>` is a per-page page header (i.e., a hero with a heading), not a site header.

### Proposed fix

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

### Two-stage implementation

1. **Lib side (`lib/analyze.ts`):** keep the current strict prefix heuristic but ALSO populate a candidate list per slot — every cluster appearing on ≥80% of pages, regardless of tag. Surface in `analysis/clusters.json` as `layoutCandidates: { header: [...], nav: [...], footer: [...] }` so the agent has a curated input.
2. **Agent side (`agents/layout-extractor.md`):** rewrite the rules card to use the multi-signal score above, drawing on cluster summaries (tagSkeleton + memberIds + sampleText). The agent is the right layer for content-aware decisions per spec § 11.4.

### Action items

- [ ] Add `layoutCandidates` to `clusters.json` shape (any cluster with distinct-page coverage ≥0.8)
- [ ] Update `schemas/sections.ts` (or wherever `clusters.json` is typed) to include `layoutCandidates`
- [ ] Rewrite `agents/layout-extractor.md` rules with the multi-signal scoring rubric
- [ ] Add a regression test in `test/analyze.test.ts`: cluster with `<div>`-prefix tagSkeleton + identical sample text + 100% page coverage → promoted to nav slot when LLM agent runs (or pre-populated as a candidate when only the algorithmic pass runs)
- [ ] Document the dual-pass behavior in `knowledge/phase-pitfalls/analyze.md`

---

## How to use this file

- Append a new `## ISSUE-NNN` block per finding. Increment NNN.
- One issue per anomaly. Don't merge unrelated findings.
- Required sections: **Surfaced by**, **Severity**, **Status**, **Evidence pattern**, **Root cause**, **Proposed fix**, **Action items**.
- Status values: `Open`, `In progress`, `Resolved (commit-sha)`, `Won't fix (rationale)`.
- Resolved issues stay in this file — do not delete. Future phases may regress.
- Site-specific quirks (a particular CMS's weird DOM, a single page's odd behavior) do NOT belong here. Those go in the user project's `.migration/findings/` and, if they generalize, get distilled into `knowledge/phase-pitfalls/<phase>.md`.
- Plugin bugs that affect any user project belong here.
