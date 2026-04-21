# WordPress Divi Adapter Research

**Date:** 2026-03-30
**Adapter:** .ai/adapters/wordpress-divi.json

## Official Documentation Sources
- Elegant Themes Sections Docs — section types (Regular, Specialty, Fullwidth), hierarchical structure
- Divi Animation Options — 7 animation types, data-animation-* attributes
- Divi CSS Selectors Guide (wpzone) — CSS selectors for sections/rows/columns/modules
- Divi Builder JS API — window.ET_Builder object, et_builder_api_ready event
- Divi Rows & Row Options — default max-width 1080px, 80% width, gutter width 1-4
- GitHub wp-divi source — et_pb_custom global, waypoints dependency, all CSS classes

## Live Sites Inspected
- naturalchefmallorca.com — Divi 4.27.6, body classes: et_divi_theme et-db et_pb_pagebuilder_layout, Theme Builder active, 12 sections (et_pb_section_0 through _11), SPA false positive (bodyDirectChildSections: 2)
- nomadcapitalist.com — Divi with Theme Builder, Cookiebot CMP, header.et-l.et-l--header + footer.et-l.et-l--footer, 9+ page sections
- www.baitic.com/en/ — Divi with Theme Builder, bodyDirectChildSections: 2
- divithemeexamples.com — Divi 4.27.4, Theme Builder, bodyDirectChildSections: 1

## Detection Signals Found
- JS globals: window.ET_Builder, window.et_pb_custom, document.querySelector('.et_pb_section'), document.querySelector('body.et_divi_theme')
- DOM markers: .et_pb_section, body.et_divi_theme, #et-boc, body.et-db, body.et_pb_pagebuilder_layout
- URL patterns: /wp-content/themes/Divi/, /wp-content/et-cache/
- Class patterns: et_pb_* prefix (sections, rows, columns, modules), et-l--header/footer/post (Theme Builder)

## Section Discovery Results
- naturalchefmallorca.com: 12 sections with .et_pb_section inside .et-l--post .et_builder_inner_content
- nomadcapitalist.com: 9+ sections, Theme Builder structure with .et-l containers
- body > * yields 1-2 elements on all sites (needs spaContainerHints)

## Quirks Discovered
1. Wrapper-soup — 6+ levels of nesting from body to module content
2. Inline styles everywhere — padding, backgrounds, sizing on section/row/module elements
3. SPA false positive — #page-container is only body child
4. Theme Builder vs Classic structure divergence — different header/footer structure
5. Dynamic numbered classes — et_pb_section_0, et_pb_row_3 change with DOM order
6. Parallax ghost elements — span.et_parallax_bg injected with absolute positioning
7. Gutter width classes — et_pb_gutters3 on body AND .et_builder_inner_content

## Open Questions
- None — all findings verified from live sites and official documentation
