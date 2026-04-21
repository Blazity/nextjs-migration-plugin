# Gatsby Adapter Research

**Date:** 2026-03-30
**Adapter:** .ai/adapters/gatsby.json

## Official Documentation Sources
- Gatsby Production App Architecture — window.___gatsby, window.___loader, app bundle structure
- Gatsby Code Splitting — chunk naming: app-[hash].js, framework-[hash].js, component---[name]-[hash].js
- Gatsby Image Plugin — data-gatsby-image-wrapper, data-main-image, data-placeholder-image
- Gatsby Head API — data-gatsby-head attribute (v4.19+)
- Gatsby Accessible Routing — #gatsby-focus-wrapper, #gatsby-announcer

## Live Sites Inspected
- www.gatsbyjs.com (v4.24.6 + Contentful) — all 3 existing markers fire, meta generator "Gatsby 4.24.6", /page-data/ works, [data-gatsby-image-wrapper] present, [data-gatsby-img-placeholder] NOT found (deprecated)
- www.typescriptlang.org (v5.16.1) — all 3 markers fire, meta generator "Gatsby 5.16.1", /page-data/ with slicesMap (v5), no gatsby-plugin-image usage
- Many former Gatsby sites migrated to Next.js (apollo, hasura, formidable)

## Detection Signals Found
- JS globals: window.___gatsby (confirmed), window.___loader (confirmed), window.___navigate, window.___chunkMapping
- DOM markers: #___gatsby, #gatsby-focus-wrapper (always present), #gatsby-announcer, [data-gatsby-image-wrapper], meta[name="generator"][content^="Gatsby"], style[data-identity="gatsby-global-css"]
- URL patterns: /page-data/ (unique to Gatsby), component--- (chunk naming), /app-[hash].js
- STALE: [data-gatsby-img-placeholder] returns 0 on all sites (legacy gatsby-image deprecated)

## Quirks Discovered
1. Double wrapper — #___gatsby > #gatsby-focus-wrapper (confirmed)
2. gatsby-plugin-image — replaced deprecated gatsby-image
3. Prefetch links — still injects <link rel="prefetch">
4. page-data.json — still works, v5 adds slicesMap
5. CSS-in-JS — Emotion and styled-components common
6. SPA single body child — bodyDirectChildSections always 1
7. Generator meta tag — "Gatsby X.Y.Z" with exact version

## Open Questions
- Gatsby is in maintenance-only mode under Netlify, declining but not dead
