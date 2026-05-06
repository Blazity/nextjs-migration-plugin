# Sanity CMS Adapter Research

**Date:** 2026-03-30
**Adapter:** adapters/sanity-cms.json

## Official Documentation Sources
- Sanity Image Transformations — complete parameter reference (30+ params)
- Sanity Asset CDN — Google CDN backbone, content-addressed SHA-1 caching
- Sanity AVIF Support — auto=format negotiation, async AVIF encoding
- Sanity Visual Editing Overlays — data-sanity attribute (preview mode only)
- sanity-io/asset-utils GitHub — official regex patterns for asset IDs and URLs

## Live Sites Inspected
- haydencapital.com (Astro+Sanity) — detected via cdn.sanity.io, 11 content sections
- linear.app (Next.js+Sanity) — detected via cdn.sanity.io, major production site
- netlify.com — Astro detected but Sanity NOT detected on homepage (SSG pre-renders)
- sanity.io, brilliant.org — timed out on networkidle

## Detection Signals Found
- URL patterns: cdn.sanity.io/images/ (primary), cdn.sanity.io/files/ (non-image assets), apicdn.sanity.io (GROQ API)
- DOM markers: img[src*='cdn.sanity.io'], source[srcset*='cdn.sanity.io']
- No reliable JS globals in production
- HTTP headers: x-sanity-shard (only on direct CDN requests)

## Image Format Details
- URL: cdn.sanity.io/images/<projectId>/<dataset>/<hash>-<W>x<H>.<ext>
- Asset ID regex: ([a-zA-Z0-9_]{24,40}|[a-f0-9]{40})-\d+x\d+
- 30+ transform params: w, h, fit, crop, fp-x, fp-y, fm, q, auto, blur, sharp, flip, or, rect, dpr, etc.
- auto=format: AVIF > WebP > original (async AVIF encoding)
- Quality default: 75 for JPG/WebP

## Quirks Discovered
1. Project-dataset URL structure — vanity filename path segment
2. Hotspot cropping — fp-x/fp-y focal point
3. Auto format — AVIF with async encoding
4. SVG no transforms — pass through untransformed
5. LQIP/BlurHash metadata — 20px base64 PNG in asset metadata
6. Content-addressed caching — indefinite, change = new URL
7. Custom CDN domains — Enterprise feature

## Open Questions
- None
