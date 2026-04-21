# Wix Adapter Research

**Date:** 2026-03-30
**Adapter:** .ai/adapters/wix.json

## Official Documentation Sources
- Wix Velo Page Rendering — Thunderbolt is the site loading/rendering infrastructure, renders server-side and client-side
- Wix Media SDK (wixmedia-php) — complete image CDN URL format: /v1/{operation}/w_{w},h_{h},al_c,q_{q},enc_avif,quality_auto/
- Wix Page Structure — pages built with sections, containers, and nested elements; masterPage.js runs across all pages
- Wix Editor vs Studio — both use Thunderbolt renderer; Studio has responsive cascading breakpoints, Classic has separate mobile view
- Wix Animations GitHub — uses react-transition-group internally; entrance, scroll, hover, loop animation types

## Live Sites Inspected
- www.ilovechickpea.ca — Wix Editor Classic, 5 wixui-section elements, meta generator "Wix.com Website Builder", JS globals: fedops/thunderboltTag/viewerModel, images from static.wixstatic.com/media/, Server: Pepyaka
- www.copperandbrass.net — Wix Editor with e-commerce, same DOM structure, additional wixui components (search-bar, login-social-bar, repeater), timeout on networkidle
- www.haircomesthebride.com — Wix Editor with e-commerce, 9 wixui-section elements, 171 comp-* elements, masterPage display: grid, timeout on networkidle

## Detection Signals Found
- HTTP headers: server: Pepyaka (unique to Wix), x-wix-request-id, link preconnect to static.parastorage.com and static.wixstatic.com
- Meta tags: meta[name="generator"] content="Wix.com Website Builder", meta[name="X-Wix-Meta-Site-Id"]
- JS globals: window.fedops, window.thunderboltTag ("libs-releases-GA-local"), window.viewerModel (rich config), window.clientSideRender, window.consentPolicyManager
- DOM markers: #SITE_CONTAINER, #masterPage.mesh-layout, [data-mesh-id], [id^="comp-"], .wixui-section
- URL patterns: static.wixstatic.com/media/ (images), static.parastorage.com/ (JS/CSS), siteassets.parastorage.com (site assets)

## Section Discovery Results
- chickpea.ca: 5 sections with .wixui-section, 3 masterPage children (#SITE_HEADER, #PAGES_CONTAINER, #SITE_FOOTER)
- Sections buried 12 DOM levels deep — need direct selector, not depth-based discovery
- #SITE_HEADER and #SITE_FOOTER are direct children of #masterPage (grid rows)

## Quirks Discovered
1. networkidle never resolves — persistent connections timeout Playwright (2/3 sites)
2. 12-level deep section nesting
3. mesh-layout pointer-events: none trick
4. Obfuscated hash class names (not stable across deploys)
5. Background images in parallel #BACKGROUND_GROUP tree
6. Custom web components (wow-image, wix-dropdown-menu)
7. CSS variable theme colors as RGB triplets

## Open Questions
- None — Editor and Studio both use Thunderbolt, single adapter handles both
