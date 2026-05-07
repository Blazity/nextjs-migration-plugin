# WordPress Core Adapter Research

**Date:** 2026-03-30
**Adapter:** adapters/wordpress.json

## Official Documentation Sources
- WordPress Site Architecture docs — classic theme hierarchy: `body > div#page > (header, #content, #sidebar, #footer)`
- body_class() reference — auto-generates classes: home, blog, single, page, wp-embed-responsive, wp-theme-{slug}
- REST API Discovery — outputs `<link rel="https://api.w.org/">` and Link HTTP header by default
- WordPress 6.1 Layout Classes — block themes output is-layout-flow, is-layout-constrained, is-layout-flex
- Underscores (_s) starter theme — canonical classic structure: div#page.site > header#masthead + main#primary.site-main + footer#colophon

## Live Sites Inspected
- wordpress.org/news/ — Block theme (wporg-news-2021), detected via window.wp + meta generator ("WordPress 7.1-alpha"), bodyDirectChildSections: 2, isSPA: true (false positive), wp-site-blocks wraps all content
- whitehouse.gov — Block theme, security-hardened (no meta generator, no api.w.org link, no emoji settings), detected only via window.wp + /wp-content/, bodyDirectChildSections: 1, Strapi false positive from /uploads/ pattern
- techcrunch.com — Block theme (tc-24), WordPress VIP hosted, X-Powered-By: WordPress VIP, meta generator "WordPress 6.9.4", 20 children inside main (rich section structure), Strapi false positive

## Detection Signals Found
- HTTP headers: Link with rel="https://api.w.org/" (2/3 sites), X-Powered-By: WordPress VIP (1/3)
- Meta tags: `<meta name="generator" content="WordPress X.X">` (2/3 sites — removed on security-hardened sites)
- JS globals: window.wp (3/3, always present), window._wpemojiSettings (2/3, removable)
- DOM markers: body.wp-embed-responsive (3/3), .wp-site-blocks (3/3 block themes), a#wp-skip-link (3/3), link[rel="https://api.w.org/"] (2/3)
- URL patterns: /wp-content/ (3/3), wp-content/themes/ (3/3)
- Class patterns: wp-theme-{slug} on body (block themes), wp-block-* classes

## Section Discovery Results
- wordpress.org/news/: 5 sections with `.wp-site-blocks > *` (header, h1, main, 2x footer)
- whitehouse.gov: 3 sections with `.wp-site-blocks > *` (header, main, footer)
- techcrunch.com: 5 sections with `.wp-site-blocks > *` (banner, header, ad, main, footer), 20 children in main

## Quirks Discovered
1. False SPA detection — all 3 sites flagged as SPA due to single wp-site-blocks wrapper
2. Security-hardened sites strip most detection signals — only window.wp + /wp-content/ survive
3. Block vs classic theme structure requires different section selectors
4. Strapi adapter false positive on WP sites — /uploads/ matches /wp-content/uploads/
5. wp-block-separator elements inflate section counts (need skipSelector)
6. Block theme body classes differ from classic (wp-theme-{slug} vs more granular)

## Open Questions
- None — all findings verified from live sites
