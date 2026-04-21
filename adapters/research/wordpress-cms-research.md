# WordPress CMS Adapter Research

**Date:** 2026-03-30
**Adapter:** .ai/adapters/wordpress-cms.json

## Official Documentation Sources
- WordPress Responsive Images API — core srcset/sizes, max_srcset_image_width default 2048px
- WordPress 6.5 AVIF Support — native AVIF with quality 82 default
- WordPress 5.3 Big Image Handling — -scaled suffix, 2560px threshold, 1536x1536 and 2048x2048 core sizes
- WordPress 6.3 Image Performance — fetchpriority="high" on LCP image
- Photon API Reference — complete query parameter list (w, h, crop, resize, fit, quality, zoom, filter)
- Modern Image Formats Plugin — <picture> element wrapping, WebP/AVIF sub-size generation

## Detection Signals Found
- URL patterns: /wp-content/uploads/ (all WP), i[0-3].wp.com (Photon CDN — 4 servers not 3), .go-vip.net (VIP hosting)
- DOM markers: img[src*="wp-content/uploads"], img[data-lazy-src*="wp-content/uploads"], picture source[srcset*="wp-content/uploads"]
- Strapi false positive confirmed on whitehouse.gov and techcrunch.com (generic /uploads/ matches /wp-content/uploads/)

## Image Format Details
- Default sizes: 150x150, 300, 768, 1024, 1536, 2048, scaled (2560px threshold)
- Photon CDN: i0-i3.wp.com, transparent WebP conversion (extension unchanged, Content-Type differs)
- VIP: auto WebP via Accept header, .go-vip.net domain
- Modern formats: <picture> with <source> for WebP/AVIF fallback chain

## Quirks Discovered
1. Filename responsive images — -WxH and -scaled suffixes
2. Jetpack Photon rewrites — i0-i3.wp.com, transparent WebP
3. Lazy load plugins — data-src, data-lazy-src, data-lazy-srcset, data-bg
4. Big image scaled suffix — -scaled.{ext} for >2560px uploads
5. fetchpriority LCP image — fetchpriority="high" on first image, no lazy
6. Modern format picture element — <picture> wrapping with source srcset

## Open Questions
- None
