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

## How to use this file

- Append a new `## ISSUE-NNN` block per finding. Increment NNN.
- One issue per anomaly. Don't merge unrelated findings.
- Required sections: **Surfaced by**, **Severity**, **Status**, **Evidence pattern**, **Root cause**, **Proposed fix**, **Action items**.
- Status values: `Open`, `In progress`, `Resolved (commit-sha)`, `Won't fix (rationale)`.
- Resolved issues stay in this file — do not delete. Future phases may regress.
- Site-specific quirks (a particular CMS's weird DOM, a single page's odd behavior) do NOT belong here. Those go in the user project's `.migration/findings/` and, if they generalize, get distilled into `knowledge/phase-pitfalls/<phase>.md`.
- Plugin bugs that affect any user project belong here.
