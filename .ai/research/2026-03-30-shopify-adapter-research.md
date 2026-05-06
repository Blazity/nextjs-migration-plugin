# Shopify Adapter Research

**Date:** 2026-03-30
**Adapter:** adapters/shopify.json

## Official Documentation Sources
- Shopify Sections Architecture — each section wrapped in .shopify-section, tag configurable via schema (div/section/header/footer/aside)
- Section Schema — static sections use filename ID, JSON template sections get template--{id}__{name} IDs
- Section Rendering API — section groups: shopify-section-group-header-group/footer-group
- image_url Liquid Filter — CDN format with width/height/crop/format params
- Dawn Theme (GitHub) — reference Online Store 2.0 theme
- Shopify Web Components — custom elements: shop-pay-button, shop-cart-sync

## Live Sites Inspected
- www.allbirds.com — Traditional Liquid theme, 14 .shopify-section elements, powered-by: Shopify header, dual CDN (cdn.shopify.com + /cdn/shop/), 52 opacity-0 scroll-reveal elements, ScrollTrigger loaded
- www.brooklinen.com — Dawn 7.0 theme, 13 .shopify-section elements, sections inside main > .content-container (not direct main children), stepped--hide animation pattern
- hiutdenim.co.uk — Hydrogen/Oxygen headless, 0 .shopify-section elements, minimal window.Shopify, CDN uses oxygen-v2/ path, Tailwind CSS native

## Detection Signals Found
- HTTP headers: powered-by: Shopify (most reliable), x-request-id, x-dc (GCP region), shopify-complexity-score, server-timing with theme/pageType
- Meta tags: shopify-digital-wallet, shopify-checkout-api-token
- JS globals: window.Shopify (with .theme, .shop), window.ShopifyAnalytics, window.trekkie
- DOM markers: .shopify-section (Liquid stores only), #web-pixels-manager-sandbox-container, shop-cart-sync
- URL patterns: cdn.shopify.com/s/files/, .myshopify.com, /cdn/shop/files/, /cdn/shopifycloud/
- False positive: Shopify's [data-section-id] overlaps with Squarespace detection

## Section Discovery Results
- Allbirds: 14 sections with .shopify-section (4 header-group + 7 template + 3 footer-group)
- Brooklinen: 13 sections with .shopify-section (1 header + 11 template + 1 footer)
- Hydrogen stores: 0 .shopify-section — completely different DOM

## Quirks Discovered
1. networkidle never completes — persistent tracking scripts prevent idle state
2. Section tag polymorphism — .shopify-section can be div/section/header/footer/aside
3. Invisible sections — cart drawers, modals, geofencing get .shopify-section class
4. Squarespace false positive — [data-section-id] overlap
5. Dawn nested content-container — sections inside main > .content-container
6. Scroll-reveal opacity-zero — many themes start sections invisible
7. Hydrogen headless — no .shopify-section, completely different DOM
8. Dual CDN formats — cdn.shopify.com and domain-proxied /cdn/shop/

## Open Questions
- Whether Shopify Hydrogen needs a separate adapter (likely yes)
