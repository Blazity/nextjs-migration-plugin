# ISSUE-001: SPA_FLOW_EXTRACTION misclassified on statically-rendered pages

**Surfaced by:** Phase 1 (Discover)
**Severity:** High — routes static pages through the heavier SPA flow in Phase 4 unnecessarily, multiplying extraction cost and complexity
**Status:** Open

## Evidence pattern

A page is statically rendered (full HTML present in `view-source`, all content visible without JS execution) but the probe still emits `recommendation: "SPA_FLOW_EXTRACTION"`. Cross-check signals:

- `spaAnalysis.isSPA` is `false`
- `spaAnalysis.bodyDirectChildSections` is high (≥4)
- A framework adapter matched definitively
- `contentValidation.fallbackSignals` lists `h1-url-mismatch` and/or `url-content-mismatch`

When all of the above hold, the SPA recommendation is wrong — the page is fine for `DIRECT_EXTRACTION`.

## Root cause

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

## Proposed fix

Two-part change in `scripts/lib/probe-analysis.ts`. Pick one or do both:

1. **Expand the framework exemption.** Add `webflow`, `wix`, `squarespace`, `framer`, `wordpress` (and variants), and `nextjs` to `H1_OPTIONAL_FRAMEWORKS`. Keep only React-only adapters (`react`, frameworks that ship as pure SPAs) outside the set, since those genuinely render placeholder shells.
2. **Gate `contentMatchesUrl` on body length.** Only treat keyword-absence as a fallback signal when body text is short (e.g., `< 500` chars). Pages with substantial copy never look like fallbacks regardless of slug overlap.

A narrower alternative that sidesteps the heuristic entirely: when `isSPA: false` AND `bodyDirectChildSections >= 4`, force `DIRECT_EXTRACTION` regardless of fallback signals. Body-section count is a stronger truth signal than slug heuristics.

## Action items

- [ ] Decide: framework allowlist, body-content gate, or section-count override (or combination)
- [ ] Patch `scripts/lib/probe-analysis.ts`
- [ ] Add a regression test: a probe input with `hasDetectedFramework: true`, `contentMatchesUrl: false`, `h1MatchesUrl: false`, and a static-marketing-site framework should yield `DIRECT_EXTRACTION`
- [ ] Document the new behavior in `knowledge/phase-pitfalls/discover.md`
