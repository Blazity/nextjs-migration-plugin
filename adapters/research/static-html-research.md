# Static HTML Fallback Adapter Research

**Date:** 2026-03-30
**Adapter:** .ai/adapters/static-html.json

## Official Documentation Sources
- Hugo Generator docs — `<meta name="generator" content="Hugo 0.158.0">`, can be disabled via disableHugoGeneratorInject
- Jekyll jekyll-seo-tag — `<meta name="generator" content="Jekyll v4.3.2" />` + `<!-- Begin Jekyll SEO tag -->` comment
- Eleventy — `<meta name="generator" content="Eleventy v2.0.1">` via {{ eleventy.generator }}
- Hexo — `<meta name="generator" content="Hexo 4.0.0">` via <%- meta_generator() %>
- Wappalyzer detection patterns for Hugo, Jekyll, Eleventy

## Live Sites Inspected
- example.com — no adapter matched, bodyDirectChildSections: 1 (wraps to 3), DIRECT_EXTRACTION
- gohugo.io (Hugo) — no adapter matched, bodyDirectChildSections: 4, good section count
- jekyllrb.com (Jekyll) — no adapter matched, bodyDirectChildSections: 6, excellent semantic structure
- motherfuckingwebsite.com — no adapter matched, bodyDirectChildSections: 20, flat h2/p/ul structure

## Detection Signals Found
- Hugo: meta[name="generator"][content^="Hugo"] (when not disabled)
- Jekyll: meta[name="generator"][content^="Jekyll"] (requires jekyll-seo-tag plugin)
- Eleventy: meta[name="generator"][content^="Eleventy"]
- Hexo: meta[name="generator"][content^="Hexo"]
- Generic static: absence of all framework markers (this is the fallback)

## Section Discovery Results
- body > * works for all tested sites
- Common wrappers: #content, #wrapper, .wrapper, #container, .container
- spaContainerHints cover these patterns

## Quirks Discovered
1. Bootstrap grid wrapper soup — .container > .row > .col-*
2. Foundation grid system — .grid-container > .grid-x > .cell
3. Flat body structure — 15+ direct body children
4. Relative asset paths — no CDN patterns
5. Inline styles prevalence — common in hand-coded sites
6. Generator tag optional — many static sites have none

## Open Questions
- None — this is a fallback adapter, designed to work when nothing else matches
