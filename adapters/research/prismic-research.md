# Prismic CMS Adapter Research

**Date:** 2026-03-30
**Adapter:** .ai/adapters/prismic-cms.json

## Official Documentation Sources
- Prismic Image Documentation — main image component docs
- Prismic Image Field Reference — URL structure, responsive views
- Prismic Imgix Blog Post — imgix integration details, full parameter list
- SVG Handling Changes — security vulnerability led to SVG domain split

## Live Sites Inspected
- pallyy.com (Nuxt+Prismic) — detected via images.prismic.io, API at smi-blog.cdn.prismic.io/api/v2
- greenly.earth (Next.js+Prismic) — two domains: images.prismic.io (raster) + greenly.cdn.prismic.io (SVG)
- pitchy.fr (Next.js+Prismic) — mixed old UUID and new short-ID formats, ?auto=format%2Ccompress&fit=max&w=2048

## Detection Signals Found
- URL patterns: images.prismic.io (raster), *.cdn.prismic.io (SVGs/API), prismic-io.s3.amazonaws.com (legacy)
- JS globals: window.prismic, window.Prismic (when toolbar/preview enabled)
- DOM markers: script[src*='.prismic.io/'] (toolbar script)

## Quirks Discovered
1. Imgix backend — full Imgix API on images.prismic.io
2. Auto compress/format — default serves AVIF/WebP
3. Rect cropping — editorial crop decisions
4. Repo name in URL
5. SVG separate domain — cdn.prismic.io, no imgix params
6. Legacy S3 images — prismic-io.s3.amazonaws.com
7. Dual asset ID format — UUID and short base64

## Open Questions
- None
