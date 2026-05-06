# Astro Adapter Research

**Date:** 2026-03-30
**Adapter:** adapters/astro.json

## Official Documentation Sources
- Astro v5/v6 Upgrade Guides — breaking changes, server islands, renamed ViewTransitions to ClientRouter
- Astro Scoped Styles — two strategies: attribute (data-astro-cid-{hash}) and class (astro-{hash} with :where())
- Astro View Transitions — ClientRouter component, data-astro-transition-scope/persist/fallback/rerun/reload/exec
- Astro Server Islands — server:defer directive, async component loading
- Astro Prefetch — data-astro-prefetch attribute on links, strategies: hover/tap/viewport/load

## Live Sites Inspected
- astro.build (v6.1.2) — 0 astro-islands, 11 data-astro-cid hashes (attribute scoping), data-astro-prefetch on links, 4 body children
- docs.astro.build (v6.0.2) — 0 astro-islands, ZERO data-astro-cid (class-based scoping: 35 astro-* classes), triggers Svelte false positive from Starlight
- starlight.astro.build (v6.0.1) — 0 astro-islands, class-based scoping
- astro.new (v5.0.0) — 0 astro-islands, 2 data-astro-cid hashes, data-astro-transition-scope + data-astro-exec present, Netlify CDN rewrites /_astro/

## Detection Signals Found
- Meta tags: meta[name="generator"] content="Astro v{semver}" (confirmed on all sites)
- DOM markers: data-astro-cid-* (attribute strategy), astro-* classes (class strategy), data-astro-prefetch, data-astro-transition-scope, astro-island (rare)
- URL patterns: /_astro/ for JS/CSS/images (confirmed all sites, may be URL-encoded in CDN rewrites)
- JS globals: window.__astro NOT detected on any site (unreliable)

## Section Discovery Results
- astro.build: 4 body direct children (clean semantic HTML, minimal wrappers)
- All sites: body > * works perfectly, no SPA container unwrapping needed

## Quirks Discovered
1. Clean HTML — minimal wrappers, best semantic HTML of any framework
2. Zero islands on production — most pages are fully static
3. Mixed framework islands — Starlight uses Svelte internally
4. Dual scoped style strategies — attribute vs class based
5. Server islands (Astro 5+) — async deferred components
6. View Transitions renamed — ViewTransitions → ClientRouter, meta tag unreliable
7. CDN image rewriting — /_astro/ URL-encoded in CDN query strings
8. Astro 6 scoping change — attributes on child elements in nested selectors

## Open Questions
- None — all findings verified
