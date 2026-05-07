# Webflow Adapter Research

**Date:** 2026-03-30
**Adapter:** adapters/webflow.json

## Official Documentation Sources
- Webflow Forum: `data-wf-site` and `data-wf-page` are required for IX2 animations, widgets, and CMS functionality
- Client-First (Finsweet): defines `page-wrapper`, `main-wrapper`, `padding-global`, `container-large`, `padding-section-*` hierarchy
- Webflow CSS reference (css.timothyricks.com): 80+ built-in `w-*` classes documented
- GSAP became native in Webflow mid-2025; served from `cdn.prod.website-files.com/gsap/`
- Webflow component variants generate `w-variant-{uuid}` classes
- Three CDN hostnames: `cdn.prod.website-files.com`, `assets.website-files.com`, `assets-global.website-files.com`
- Localization adds hreflang tags in `<head>`, lang attribute on `<html>`, locale prefix in URL path (no DOM structure change)

## Live Sites Inspected
- blazity.com — Webflow detected (4 markers), 12 body sections, flat structure, IX2 animations, Client-First classes
- callstack.com — Webflow detected (4 markers), 1 body child (.page-wrapper wraps everything), 11 sections inside main-wrapper, IX2 + GSAP hybrid, heavy CMS/Finsweet usage, 20 w-variant-* classes
- lattice.com — Webflow detected (4 markers), 4 body children, 8 sections inside `<main>`, IX3/GSAP only (no IX2), osano cookie consent, data-wf-* component attributes

## Detection Signals Found
- HTTP headers: `x-wf-region` (unique to Webflow, verified on all 3 sites)
- Meta tags: none (Webflow does not set meta generator)
- JS globals: `window.Webflow` (with require, tram, env methods), `window.jQuery` (always 3.5.1)
- DOM markers: `html[data-wf-site]`, `html[data-wf-page]`, `html[data-wf-domain]`, `.w-nav`, `script[src*="d3e54v103j8qbb.cloudfront.net"]`
- Script domains: `d3e54v103j8qbb.cloudfront.net` (jQuery), `cdn.prod.website-files.com` (assets/GSAP)
- Class patterns: `w-mod-js`, `w-mod-ix`/`w-mod-ix3` on `<html>`, `w-layout-grid/hflex/vflex/blockcontainer`, `w-variant-{uuid}`

## Section Discovery Results
- blazity.com: 12 sections with `body > *` (flat structure)
- callstack.com: 1 section with `body > *` (FAILS — need `.page-wrapper > main.main-wrapper > *` for 11 sections)
- lattice.com: 4 sections with `body > *` (UNDERCOUNTS — need `main > *` for 8 sections)

## Quirks Discovered
1. Three distinct body structures (flat, Client-First wrapped, semantic main)
2. Dual animation systems (IX2 legacy vs IX3/GSAP modern, some sites use both)
3. Client-First is optional, not universal
4. CDN 403 errors on some background-image URLs
5. Component variant UUIDs (w-variant-{uuid}) are opaque
6. jQuery 3.5.1 always loaded from d3e54v103j8qbb.cloudfront.net
7. Finsweet ecosystem common on professional sites (fs-cmsfilter, fs-cmsload attributes)
8. Modern sites use data-wf-element-id, data-wf-component-context, data-wf--*--variant attributes

## Open Questions
- Exact GSAP plugin list available from Webflow CDN (confirmed: gsap, ScrollTrigger, SplitText, MorphSVG, TextPlugin)
- Whether Webflow Localization changes any DOM structure beyond lang attribute and URL prefix (confirmed: no)
