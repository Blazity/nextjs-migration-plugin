# Nuxt Adapter Research

**Date:** 2026-03-30
**Adapter:** .ai/adapters/nuxt.json

## Official Documentation Sources
- Nuxt 4 Upgrade Guide — window.__NUXT__ removal after hydration
- Nuxt Image / IPX Provider — /_ipx/ base URL, self-hosted image optimizer
- NuxtImg Component Source — data-nuxt-img attribute
- Nuxt Security — default X-Powered-By: Nuxt header
- GitHub PR #27745 — confirmed __NUXT__ removal after app init

## Live Sites Inspected
- nuxt.com (Nuxt 4.4.2) — detected via __NUXT_DATA__ + #__nuxt, IPX images at ipx.nuxt.com, data-v-* scoped styles, no X-Powered-By (Vercel)
- ui.nuxt.com (Nuxt 3/4) — same detection, /_ipx/ self-hosted images, data-nuxt-img attribute
- volta.net (Nuxt, client-rendered) — X-Powered-By: Nuxt present, data-ssr="false"
- nuxters.nuxt.com (Nuxt 3/4) — X-Powered-By: Nuxt, data-ssr="true"

## Detection Signals Found
- JS globals: window.__NUXT__ (removed after hydration in Nuxt 4!), window.__NUXT_DATA__ (reliable), document.querySelector('[data-nuxt-data]') (most reliable)
- DOM markers: #__nuxt (all versions), script#__NUXT_DATA__ (Nuxt 3/4), [data-nuxt-data] (Nuxt 3/4), data-server-rendered (Nuxt 2 ONLY)
- URL patterns: /_nuxt/ (all versions), /_ipx/ (Nuxt Image), /_payload.json
- HTTP headers: X-Powered-By: Nuxt (2/4 sites, stripped by security modules)

## Quirks Discovered
1. Scoped style hashes (data-v-*) — confirmed
2. SSR hydration — data-server-rendered is Nuxt 2 only
3. ClientOnly components — Nuxt 4 uses comment placeholders
4. Nuxt 4 payload removal — __NUXT__ deleted after hydration
5. IPX image URLs — /_ipx/ and ipx.nuxt.com
6. Payload JSON external — /_payload.json with buildId

## Open Questions
- None
