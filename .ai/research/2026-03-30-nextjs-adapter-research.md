# Next.js Adapter Research

**Date:** 2026-03-30
**Adapter:** adapters/nextjs.json

## Official Documentation Sources
- Image Component API — /_next/image URL format, data-nimg attribute, srcset generation, deviceSizes/imageSizes
- Static Exports Guide — output: 'export' has no /_next/image optimization API
- Script Component API — data-nscript attribute, loading strategies (afterInteractive, lazyOnload)
- next.config.js poweredByHeader — x-powered-by: Next.js header (on by default, can be disabled)
- Layouts RFC / App Router — root layout defines html/body, no #__next wrapper

## Live Sites Inspected
- vercel.com — App Router, Next.js 16.2.1-canary.7, NO #__next, NO __NEXT_DATA__, window.next.appDir=true, 104 RSC flight scripts, x-powered-by: Next.js, x-nextjs-prerender: 1, data-nimg="1" on images
- nextjs.org — App Router, Next.js 16.2.1-canary.7, NO #__next, NO __NEXT_DATA__, 32 RSC scripts, /_next/image?url= format for images
- supabase.com — Pages Router, Next.js 15.5.14, HAS #__next, HAS __NEXT_DATA__, NO self.__next_f, data-nimg="fill" and "1"

## Detection Signals Found
- HTTP headers: x-powered-by: Next.js (can be disabled), x-nextjs-prerender: 1 (App Router), vary: rsc, next-router-state-tree... (App Router)
- JS globals: window.next (universal), window.__NEXT_DATA__ (Pages Router only), self.__next_f (App Router only)
- DOM markers: #__next (Pages Router only), next-route-announcer (universal), img[data-nimg] (when using next/image), [data-nscript] (when using next/script)
- URL patterns: /_next/static/chunks/, /_next/static/css/, /_next/static/media/, /_next/image?url=
- BROKEN: [data-nextjs-page] NOT found on any live site (was in old adapter)

## Section Discovery Results
- vercel.com (App Router): 3 visible body children (no wrapper div), sections are direct body children
- nextjs.org (App Router): body > header + main + footer directly
- supabase.com (Pages Router): all content inside #__next > div wrapper

## Quirks Discovered
1. App Router has NO #__next div — content as direct body children
2. RSC flight data script flood — dozens to hundreds of inline scripts
3. next-route-announcer custom element with Shadow DOM
4. Image optimization URL rewrite (/_next/image?url=)
5. Static export has no image optimization API
6. Pages Router vs App Router require different detection and section discovery

## Open Questions
- None — all findings verified from live sites
