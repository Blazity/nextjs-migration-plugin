# Framer Adapter Research

**Date:** 2026-03-30
**Adapter:** adapters/framer.json

## Official Documentation Sources
- Framer Help: Image optimization — AVIF q80, WebP fallback, srcset at 512/1024/2048/4096px
- Framer Help: Hosting infrastructure — SSR + TPR via AWS CloudFront
- Framer Help: Dynamic optimization — pages optimized on first visit, cached until publish
- BRIX Templates: How to identify Framer — detection methods catalog

## Live Sites Inspected
- doodle.com — Framer detected (all 3 markers), bodyDirectChildSections: 1, 14 data-framer-name elements, appear animations present, 5 breakpoints
- cal.com — Framer detected, bodyDirectChildSections: 1, 12 named sections at depth 2, 3 breakpoints
- miro.com — Framer detected + Contentful CMS, bodyDirectChildSections: 1, 8 named sections at depth 5

## Detection Signals Found
- Meta generator: "Framer {hash}" (all sites)
- HTML comment: "<!-- Made in Framer · framer.com -->" (all sites)
- DOM markers: data-framer-hydrate-v2, data-framer-page-optimized-at, data-framer-name, data-framer-appear-id, data-framer-component-type
- JS globals: __framer_events, __send_framer_event, __framer_importFromPackage
- URL patterns: framerusercontent.com (images/assets/sites), events.framer.com (analytics)
- NOT found in 2026: framer-body-* class, __framer-badge-container

## Section Discovery Results
- All sites: bodyDirectChildSections: 1 (single <div id="main">)
- Old spaContainerHints returned 270-2000+ elements (BROKEN — too broad)
- data-framer-name provides semantic section labels on all sites
- Generic detectSpaContainer() walk finds correct container at depth 2-5

## Quirks Discovered
1. Hashed classes — framer-[hash] changes on recompile
2. Absolute layer composition — disableUnwrap needed
3. Deep nesting — depth 14+ on some sites
4. Single #main container — always bodyDirectChildSections: 1
5. data-framer-name semantic labels — editor layer names in production DOM
6. Appear animation data — structured JSON in script tag
7. Variable breakpoints — 3-5 per site, not standardized

## Open Questions
- None
