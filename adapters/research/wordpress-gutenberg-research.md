# WordPress Gutenberg (FSE) Adapter Research

**Date:** 2026-03-30
**Adapter:** .ai/adapters/wordpress-gutenberg.json

## Official Documentation Sources
- Block Editor Handbook — blocks render with wp-block-{name} class, core blocks omit "core" namespace
- Styles Architecture — global styles output as `<style id="global-styles-inline-css">`, layout classes: is-layout-flow/constrained/flex/grid
- Root Padding Alignments — has-global-padding class, CSS vars: --wp--style--root--padding-*
- Creating Block Themes (fullsiteediting.com) — "wp-site-blocks div cannot be removed", added by get_the_block_template_html()
- Interactivity API docs — data-wp-interactive="core/navigation" for interactive blocks

## Live Sites Inspected
- developer.wordpress.org/news/ — Block theme (wporg-news-2021), bodyDirectChildSections: 1, wp-site-blocks wraps everything, 7 content sections
- developer.wordpress.org/ — Block theme, detected wordpress + wordpress-cms (Photon CDN), 7 content sections
- developer.wordpress.org/news/2024/11/whats-new-for-developers-november-2024/ — Block theme, bodyDirectChildSections: 2 (skip-link + wp-site-blocks), 5 content sections
- developer.wordpress.org/block-editor/ — Block theme, 2 content sections

## Detection Signals Found
- JS globals: window.wp (shared with classic WP), document.querySelector('.wp-site-blocks') (FSE-specific), document.querySelector('style#global-styles-inline-css') (FSE-specific)
- DOM markers: .wp-site-blocks (THE definitive FSE marker — not present in classic themes), .wp-block-template-part, style#global-styles-inline-css, .is-layout-constrained/.is-layout-flow, [data-wp-interactive]
- URL patterns: /wp-content/ (shared with classic WP)
- Class patterns: wp-block-* (80+ block types), is-layout-* (4 layout types), has-*-color/font-size/background-color (presets), alignfull/alignwide

## Section Discovery Results
- All sites: `.wp-site-blocks > *` yields 3-5 top-level sections (header template-part, main, footer template-part)
- `.wp-block-post-content > *` yields inner content blocks for deeper granularity
- `body > *` yields only 1-2 (skip-link + wp-site-blocks) — always needs unwrapping

## Quirks Discovered
1. Single wrapper (wp-site-blocks) triggers SPA false positive — all sites flagged as SPA
2. Per-block CSS loading — different pages load different stylesheets
3. Duotone SVG filters injected after `<body>` appear as spurious elements
4. wp-container-{random-id} classes change every page load
5. Group/Cover blocks add *__inner-container wrappers (extra nesting level)
6. Navigation uses Interactivity API (data-wp-interactive), not React/SPA
7. Root padding doubling when has-global-padding is nested
8. Responsive images use filename suffixes (-1024x768.jpg) not URL params

## Open Questions
- None — all findings verified from live sites and official documentation
