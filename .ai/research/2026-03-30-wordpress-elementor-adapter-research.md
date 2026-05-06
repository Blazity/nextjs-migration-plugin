# WordPress Elementor Adapter Research

**Date:** 2026-03-30
**Adapter:** adapters/wordpress-elementor.json

## Official Documentation Sources
- Elementor Developer Docs: Widget DOM Optimization — widget wrapper structure (legacy dual-div vs optimized single-div)
- Elementor DOM Improvements v3.0 — removal of .elementor-widget-wrap, .elementor-column-wrap wrappers
- Element.how: Selector & Wrapper Divs — complete DOM hierarchy with all wrapper class names
- Elementor Data Structure — JSON structure: id, elType, settings, elements
- Elementor Animation Control — Animate.css-based entrance animations, 37 types across 8 categories
- Elementor Motion Effects — scroll and mouse parallax effects (Pro)
- Elementor Flexbox Containers — e-con/e-parent/e-child replacing sections/columns
- Elementor V4 CSS-First — single-div wrappers, 15-20% DOM reduction

## Live Sites Inspected
- lauradawn.co — HYBRID: 47 legacy sections + 7 containers on same page, Elementor 3.35.9, Theme Builder active (header/page/footer), 229 data-id elements, 5 animated elements, Swiper+Lottie, Hello Elementor theme, SPA false positive (bodyDirectChildSections: 3)
- mitchelladam.co.uk — LEGACY: 22 sections (11 top-level), 0 containers, Elementor 3.35.5, 25 animated elements, data-lazy-src lazy loading, Theme Builder active

## Detection Signals Found
- JS globals: window.elementorFrontend (primary), window.elementorModules, window.elementorFrontendConfig, window.elementorProFrontend (Pro only)
- Meta tags: meta[name="generator"] content="Elementor X.Y.Z; features: ...; settings: ..." (both sites)
- DOM markers: .elementor-section, .e-con, [data-elementor-type], [data-element_type], body.elementor-page
- URL patterns: /wp-content/plugins/elementor/, /wp-content/uploads/elementor/css/post-{id}.css
- Class patterns: elementor-element-{hash}, elementor-widget-{type}, elementor-col-{N}, e-con/e-parent/e-child

## Section Discovery Results
- lauradawn.co: 47 .elementor-top-section + 7 .e-con.e-parent (hybrid — both selectors needed)
- mitchelladam.co.uk: 11 .elementor-top-section (pure section-based, no containers)
- .elementor-top-section maps 1:1 to visual blocks on section-based sites

## Quirks Discovered
1. Dual layout systems — sections and containers can coexist on same page
2. Theme Builder SPA false positive — only 3 body children
3. data-settings JSON overload — animation + layout + widget config in one attribute
4. Multiple lazy loading strategies coexist
5. Per-page CSS splitting — 10-15+ CSS files per page
6. Shape divider inline SVGs — 35 on lauradawn.co
7. elementor-invisible animation start — elements hidden until viewport entry

## Open Questions
- None — all findings verified from live sites and official documentation
