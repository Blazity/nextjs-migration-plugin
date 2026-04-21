# Squarespace Adapter Research

**Date:** 2026-03-30
**Adapter:** .ai/adapters/squarespace.json

## Official Documentation Sources
- Squarespace Developers: HTML Attributes — data-sqsp-section and data-sqsp-block are the official API
- Squarespace Engineering: Developing Fluid Engine — 24-column desktop / 8-column mobile CSS Grid, pure CSS positioning
- Squarespace Developers: Image Loader — ?format=NNNw with 7 sizes (100w-2500w), data attributes: data-src, data-image-dimensions, data-image-focal-point
- Beyondspace: Image CDN — URL format: images.squarespace-cdn.com/content/v1/<website_id>/<image_id>/<filename>
- Squarespace Help: Animations — 5 styles (Fade, Scale, Slide, Clip, Flex), 3 speeds

## Live Sites Inspected
- www.darrenbooth.com — 7.1 template, 17 sections via [data-section-id], all 5 detection markers hit, Server: Squarespace
- www.burningred.co.uk — 7.1, 8 sections (6 page + header + overlay-nav), Server: Golfe2 (edge CDN), cookie banner v2
- www.harpersunday.com.au — 7.1, 8 sections (7 fluid-engine + 1 gallery)
- www.kurlycreative.com — 7.1, all detection markers hit

## Detection Signals Found
- HTTP headers: Server: Squarespace|Golfe2 (all sites), crumb CSRF cookie (all sites)
- Meta tags: meta[name="generator"] NOT FOUND on any 7.1 site (removed from current adapter)
- JS globals: window.Squarespace (50+ keys), window.Static (SQUARESPACE_CONTEXT with templateVersion/pageType), window.__sqsAnimationRuntime, window.YUI
- DOM markers: [data-section-id] (still works), [data-sqsp-section] (new), .site-wrapper, <!-- This is Squarespace. --> HTML comment
- Script domains: assets.squarespace.com, definitions.sqspcdn.com
- CDN domains: images.squarespace-cdn.com, static1.squarespace.com

## Section Discovery Results
- All sites: [data-section-id] yields 7-17 sections (confirmed working in 7.1)
- bodyDirectChildSections: 1 on all sites (#siteWrapper wraps everything)
- spaContainerHints needed: #siteWrapper, main#page

## Quirks Discovered
1. responsive-image-format — ?format=NNNw still current, 7 sizes up to 2500w
2. yui-block-ids — still present and still change between requests
3. fluid-engine-grid — 20-24 column CSS Grid, 11px gap, viewport-specific
4. section-border-absolute-overlay — 3-layer structure per section (background absolute, content relative)
5. siteWrapper-spa-shell — all content in #siteWrapper, probe false-positives as SPA
6. gallery-section-type — different layout system than fluid-engine
7. data-animation on both sections and children
8. HTML comment detection — <!-- This is Squarespace. -->
9. meta[name="generator"] REMOVED from 7.1 sites (was in old adapter, now invalid)
10. Server header: Squarespace or Golfe2 (edge CDN)

## Open Questions
- None — all findings verified from live sites and official documentation
