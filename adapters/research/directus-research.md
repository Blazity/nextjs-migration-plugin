# Directus CMS Adapter Research

**Date:** 2026-03-30
**Adapter:** .ai/adapters/directus-cms.json

## Official Documentation Sources
- Directus Access Files docs — URL format /assets/<uuid> with optional SEO filename
- Directus Transform Files docs — width, height, fit, quality, format, withoutEnlargement, transforms, key
- Directus Assets API — key, transforms, download query params
- GitHub api/src/constants.ts — ASSET_TRANSFORM_QUERY_KEYS definitive source

## Live Sites Inspected
- forellen-jobst.at (Nuxt+Directus) — detected via UUID pattern in /assets/ paths, self-hosted
- altron-modular.com (Next.js+Directus) — detected, clean match
- Many "built with Directus" sites undetectable — assets proxied through frontend framework

## Detection Signals Found
- URL patterns: /assets/<uuid> (primary, most reliable), *.directus.app/assets/ (Cloud only)
- NOT reliable: X-Powered-By: Directus (only on API server, not frontend), data-directus (editor only), @directus/sdk (server-side)
- No client-side JS globals or DOM markers in production

## Image Transform Parameters (complete from source code)
- width, height, fit (cover/contain/inside/outside), format (auto/jpg/png/webp/tiff/avif), quality (1-100)
- focal_point_x, focal_point_y, withoutEnlargement, key (preset), transforms (Sharp JSON), download

## Quirks Discovered
1. UUID asset filenames — files stored by UUID on disk
2. Asset URL format — /assets/<uuid> with optional /seo-filename.ext suffix
3. SEO filename suffix — UUID not always last path segment
4. Headless detection limitation — invisible if frontend proxies assets
5. Transform restriction modes — all/presets/none configuration

## Open Questions
- None
