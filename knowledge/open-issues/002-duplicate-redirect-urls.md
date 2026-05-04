# ISSUE-002: Duplicate URL entries from un-resolved redirects

**Surfaced by:** Phase 1 (Discover)
**Severity:** High (escalated 2026-05-04) — now confirmed Phase-4-blocking. `validate-extraction` flags 18 duplicate spec hashes in the blazity.com demo run (9 case studies × 2 URL shapes: `/case-study/<slug>` redirected to `/case-studies/<slug>` but both stored). Phase 4 verification gate criterion #2 fails for the entire run.
**Status:** Open

## 2026-05-04 update — confirmed Phase 4 blocker

Demo run on blazity.com produced exactly the predicted failure mode. `routes.json` has both URL shapes for all 9 case studies (`case-study` and `case-studies`); both are extracted in Phase 4 to identical specs; `validate-extraction.ts` flags 18 hash duplicates and the gate fails. This must be fixed before any Phase 4 run can pass on a site with redirect-driven path changes — which is most production sites.

## Evidence pattern

`crawl.json.pages` contains both pre- and post-redirect URLs as distinct entries with `status: 200`. Common shapes:

- Singular vs plural path: `/case-study/X` and `/case-studies/X`
- Trailing-slash variants that the server actually canonicalizes: `/foo/` redirected to `/foo` but both stored
- Old-path-redirected-to-new-path: site moved `/old/foo` to `/new/foo` via 301 but both appear in the crawl

Manual verification of any pair:

```bash
curl -sI https://example.com/duplicate-form | grep -i 'location\|HTTP/'
```

A `301`/`302` with a `Location:` header confirms the redirect; both URLs in `crawl.json` confirms the bug.

## Root cause

`scripts/crawl-site.ts` `normalize()` strips trailing slashes, hash, and query — but the crawler stores `next.url` (the queued URL) in `visited`, not the URL Playwright actually landed on after following redirects. Playwright resolves redirects automatically; `page.url()` reports the final URL. We never read it.

## Proposed fix

In `scripts/crawl-site.ts`, after `page.goto(norm)`:

```ts
const finalUrl = normalize(page.url());  // post-redirect canonical
if (visited.has(finalUrl)) continue;     // collapse to existing entry
visited.set(finalUrl, { /* ...use finalUrl, not norm... */ });
```

Two side effects to handle:

- `outboundLinks` discovered on a redirect-source page may still enqueue the non-canonical form. Dedup at queue-add time too — keep a `seenCanonical: Set<string>` and skip queuing if an equivalent post-normalize URL is already present.
- Slug derivation must use the canonical URL, not the queued one.

## Action items

- [ ] Patch `scripts/crawl-site.ts` to use `page.url()` post-goto and collapse duplicates
- [ ] Add a regression test: crawler against a fixture that 301s `/old` to `/new` records only `/new`, with `discoveredVia` preserved from the original queue entry
- [ ] Decide whether to record the redirect chain in `crawl.json.errors` or as a separate `redirects: []` field for downstream debugging
- [ ] Update `schemas/crawl.ts` if a new field is added
