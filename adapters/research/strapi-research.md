# Strapi CMS Adapter Research

**Date:** 2026-03-30
**Adapter:** .ai/adapters/strapi-cms.json

## Official Documentation Sources
- Strapi v5 Media Library — breakpoints: xlarge (1920), large (1000), medium (750), small (500), xsmall (64)
- Strapi v5 Breaking Changes — flattened API response, documentId replaces numeric id
- Strapi v5 Middleware Configuration — X-Powered-By: Strapi <strapi.io> header (customizable)
- GitHub image-manipulation.ts — generateFileName uses crypto.randomBytes(5).toString('hex') for 10-char suffix

## Live Sites Inspected
- 4xstrategy.com (Nuxt+Strapi, local uploads) — detected via _[10-hex] suffix, images from api.4xstrategy.com/uploads/
- adapttive.com (Gridsome+Strapi, Cloudinary) — detected via Cloudinary URLs with Strapi hash suffix
- alldadstalk.com (Next.js+Strapi) — detected via HTML source match

## Detection Signals Found
- CRITICAL FIX: Old domMarker img[src*="/uploads/"] caused FALSE POSITIVES on WordPress. Replaced with Strapi-specific _[0-9a-f]{10} hex suffix pattern.
- The 10-char hex suffix (crypto.randomBytes(5).toString('hex')) is THE definitive Strapi fingerprint
- No client-side JS globals — Strapi is headless
- Filename hash format identical between v4 and v5

## Quirks Discovered
1. Upload provider variance — hash suffix preserved across all providers
2. Filename prefix responsive — v5 adds xsmall_ and xlarge_
3. Cloudinary path transforms
4. Headless invisible CMS — no client-side markers
5. API subdomain pattern — images from different origin
6. v3 legacy hash filenames — 32-char MD5, not detected by current patterns

## Open Questions
- None
