# Svelte/SvelteKit Adapter Research

**Date:** 2026-03-30
**Adapter:** .ai/adapters/svelte.json

## Official Documentation Sources
- Svelte Scoped Styles — svelte-${hash} format unchanged in Svelte 5, cssHash compiler option
- SvelteKit Link Options — all data-sveltekit-* attributes documented
- SvelteKit Project Structure — app.html with %sveltekit.body% placeholder
- Svelte version detection issue (#8636) — no standardized version exposure

## Live Sites Inspected
- flowbite-svelte.com — SvelteKit+Tailwind, ZERO svelte- classes (detection failure with old adapter), __sveltekit_18fj42k global, body > div#svelte, _app/immutable/ paths
- shadcn-svelte.com — SvelteKit+Tailwind, 2 svelte- classes, __sveltekit_zbsb6c global, data-sveltekit-preload-data=hover, body > div[style="display: contents"]
- mermaid.live — SvelteKit app, __sveltekit_1y05w62, body > div#svelte, 3 svelte- classes
- layercake.graphics — SvelteKit heavy scoped styles, 2622 svelte- elements, __sveltekit_11s7etu, data-sveltekit-preload-data=hover
- coolify.io — Astro+Svelte (NOT SvelteKit), 336 svelte- classes, NO __sveltekit_*, NO data-sveltekit-*

## Detection Signals Found
- JS globals: __sveltekit_{hash} (SvelteKit-specific, all 4 SK sites), window.__svelte (all Svelte sites), __svelte_meta NOT found on any site (old adapter marker broken)
- DOM markers: [data-sveltekit-preload-data] (3/4 SK sites), [class*='svelte-'] (varies — 0 to 2622), #svelte (3/4 SK sites)
- URL patterns: _app/immutable/ (ALL SvelteKit sites, NOT on Astro+Svelte)

## Section Discovery Results
- 3/4 sites use body > div#svelte > * container
- 1/4 uses body > div[style="display: contents"] > * (default SvelteKit wrapper)
- Old adapter had #__svelte (wrong) — correct ID is #svelte

## Quirks Discovered
1. Scoped class hashes — svelte-{hash} pattern confirmed in Svelte 5
2. SPA fallback — still valid for client-rendered routes
3. Client-side routing — data-sveltekit-preload-data/code for prefetching
4. Tailwind-no-scoped-classes — dominant modern pattern causes detection failure
5. Display-contents wrapper — default SvelteKit wrapper invisible to layout
6. networkidle timeout — real-time features prevent idle state

## Open Questions
- None — all findings verified
