# Phase 1 (Discover) — pitfalls

## Crawler

- **Trailing-slash collisions.** `/about` and `/about/` are the same page. `crawl-site.ts` normalizes by stripping trailing slashes from non-root paths.
- **Hash + query strip is intentional.** `?ref=foo` and `#section` do not produce new pages. If a site uses query strings as primary navigation (some Bubble apps), expect missing pages — this is a v2 problem.
- **External redirects.** A 30x to a different origin counts as off-site and is not followed. Same-origin redirects are followed and the final URL is the one stored.
- **robots.txt is fetched once.** Per-page Disallow is not honored at granular User-agent rules — only `User-agent: *` Disallow lines.
- **JS-rendered links.** Playwright extracts links via `a[href]` after `domcontentloaded`. Sites that mount nav post-DCL (some React apps) will see a partial graph. The probe phase will detect SPA and recommend `SPA_FLOW_EXTRACTION` — but only for the seed URL since deeper URLs were never discovered. Workaround: pass them via `/migrate:add-pages` once you know them.

## Probe → adapter matching

- **Multiple matched adapters.** A page can match e.g. both `webflow` and `wordpress-elementor` if signals overlap. The first array element wins downstream; surface the full list to the user.
- **CMP detection ≠ adapter.** A `detectedCMP: "OneTrust"` finding is informational; the cookie banner is dismissed at extraction time, not here.
- **Empty `matchedAdapters` is not always fatal.** A `static-html` adapter is the default fallback for plain-HTML sites. If probe returns empty for a page that's clearly hand-rolled HTML, it's a probe-script bug, not a missing-adapter situation.

## Gate

- **Page-list confirmation is no longer a gate.** Initial page scope comes from onboarding state or explicit include-url recovery reruns. ABORT pages still need an explicit user decision the first time; subsequent runs use the recorded confirmation.
- **`VERIFICATION.md` is never written when `passed: false`.** The presence of `VERIFICATION.md` is the system's only signal that the gate passed; do not write it by hand.
- **`verification.json` is always written.** Even on fail. That's where you read failed-criteria detail from.
