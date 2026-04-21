# Contentful CMS Adapter Research

**Date:** 2026-03-30
**Adapter:** .ai/adapters/contentful-cms.json

## Official Documentation Sources
- Images API Reference — complete parameter list (w, h, fm, fl, fit, f, r, q, bg)
- CDN Domain Change Blog — March 2018 migration from contentful.com to ctfassets.net
- Content Delivery API — asset URL and CDN domain documentation

## Live Sites Inspected
- contentful.com (Next.js+Contentful) — detected via images.ctfassets.net, space ID: jtqsy5pye0zd (12 chars), 32 unique asset IDs (21-22 chars)
- intercom.com (Next.js+Contentful) — detected via images.ctfassets.net, uses Next.js image proxy wrapping Contentful URLs

## Detection Signals Found
- URL patterns: images.ctfassets.net (primary), assets.ctfassets.net (raw files), videos.ctfassets.net (video), images.eu.ctfassets.net (EU), images.contentful.com (legacy)
- No reliable JS globals or DOM markers in production (headless CMS)
- Wappalyzer uses x-contentful-request-id header (only on API responses, not pages)

## Image API Details
- Max dimensions: 4000px
- Formats: jpg, png, webp, avif, gif, tiff
- AVIF: 9 Megapixel source limit
- Fit modes: pad, fill, scale, crop, thumb
- Focus: center, top, right, left, bottom, face, faces
- Cache: max-age=31536000 (1 year) on images subdomain

## Quirks Discovered
1. Space-asset URL structure — spaceId/assetId/hash/filename
2. Format conversion — WebP/AVIF, SVG rasterization
3. Fit modes — pad default adds letterboxing
4. EU data residency — images.eu.ctfassets.net
5. Legacy domain redirect — images.contentful.com → ctfassets.net
6. assets vs images subdomain — raw files vs Image API
7. Max dimension 4000px — HTTP 400 above

## Open Questions
- None
