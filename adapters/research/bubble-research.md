# Bubble.io Adapter Research

**Date:** 2026-03-30
**Adapter:** .ai/adapters/bubble.json

## Official Documentation Sources
- Bubble Element Hierarchy — Page > Groups > Elements three-tier structure
- Bubble Responsive Design — Column/Row containers, flexbox-based layout, breakpoints: 1200/980/380px
- Bubble Hosting — AWS infrastructure, cdn.bubble.io endpoint, Cloudflare CDN
- Bubble Responsive Properties (Legacy) — older absolute positioning system with bubble-r-line/bubble-r-box

## Live Sites Inspected
- pot.bubbleapps.io (legacy engine) — bubble_version: 31, 183 .bubble-element elements, absolute positioning, bubble-r-line/bubble-r-box wrappers, x-bubble-perf header
- coachingnocodeapps.com (new engine) — bubble_version: 31, 201 .bubble-element elements, flexbox with bubble-r-container/flex/column/row, x-bubble-capacity-used header
- cuure.com, helloprenup.com, flexiple.com — all migrated away from Bubble

## Detection Signals Found
- JS globals: bubble_version (always present), _bubble_page_load_data, bubble_page_name, bubble_session_uid, appquery
- DOM markers: .main-page.bubble-element.Page (primary container), .bubble-element (all elements), .page-is-loaded (sentinel)
- URL patterns: [hex].cdn.bubble.io (CDN), .bubbleapps.io (default hosting), /package/(early_js|run_js|static_js|dynamic_js)/
- HTTP headers: x-bubble-perf (always), x-bubble-capacity-used (always), x-bubble-capacity-limit

## Section Discovery Results
- .main-page > * yields direct section children
- Legacy: .main-page > .bubble-r-line wrapper divs
- New: .main-page > .bubble-element.Group.bubble-r-container sections
- Floating groups (.floating-group) are siblings of .main-page, not children

## Quirks Discovered
1. Dual responsive engines — legacy (absolute) vs new (flexbox)
2. All inline styles — classes are structural not visual
3. Element ID hashes — non-semantic, change across deployments
4. Page wrapper not body — .main-page is the content container
5. Floating groups outside main — nav as sibling
6. CSS custom properties on html — theme colors/fonts
7. Shape elements decorative — empty divs with inline styles
8. Cloudflare Image Resizing — cdn-cgi/image/ path

## Open Questions
- None
