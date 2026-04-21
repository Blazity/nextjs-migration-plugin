# Adapter Building Template

Use this template when creating a new platform adapter. Each adapter is a JSON file at `.ai/adapters/<platform>.json`.

## Schema

```jsonc
{
  // REQUIRED — unique platform name, lowercase
  "platform": "platform-name",

  // REQUIRED — "framework" for frontend frameworks, "cms" for content management systems
  // A site uses ONE framework adapter + zero or more CMS adapters
  "type": "framework | cms",

  // REQUIRED — adapter schema version
  "version": "1.0",

  // REQUIRED — how to detect this platform on a live page
  "detection": {
    // JS expressions evaluated in page.evaluate(). Return truthy if detected.
    // Used by the probe script for auto-detection.
    "jsMarkers": ["!!window.__SOME_GLOBAL__", "!!document.querySelector('[data-special]')"],

    // CSS selectors — if any match an element on the page, platform is detected.
    "domMarkers": ["[data-special-attr]", ".platform-specific-class"],

    // Regex patterns matched against the full page HTML source.
    // Useful for CMS detection via asset URLs that may be in <img src> or inline styles.
    "urlPatterns": ["cdn\\.example\\.com/assets/"],

    // Layer 1 pre-render detection: checked before JS executes.
    // If the platform sets a <meta name="generator"> tag, specify the expected prefix here.
    // Enables definitive early detection without running JS markers.
    "metaGenerator": "PlatformName",

    // HTTP response headers unique to this platform. Key = header name, value = regex to match.
    // Checked against the initial page response headers (Layer 1 detection).
    "httpHeaders": { "x-powered-by": "PlatformName" }
  },

  // Note: CMS adapters typically omit sectionDiscovery, animations, and localSite
  // since these come from the framework adapter. CMS adapters focus on detection and images.

  // Framework adapters: how to find page sections
  "sectionDiscovery": {
    // CSS selector for top-level sections. Default: "body > *"
    "primarySelector": "body > *",

    // Selectors to try when primarySelector yields < minExpectedSections (SPA detection)
    "spaContainerHints": ["#app > *", "#__root > *"],

    // Elements to skip during section discovery
    "skipSelectors": ["script", "noscript", "style", "link"],

    // Class patterns used for section labeling
    "sectionLabelPatterns": ["section_*", "*navbar*", "*footer*", "*hero*"],

    // Minimum sections expected. When fewer are found, deeper container detection triggers.
    // Default: 3. Set higher for platforms like Framer (5+) that wrap content in few top-level containers.
    "minExpectedSections": 3,

    // When true, prevents tryUnwrapMegaSection from splitting a parent into children.
    // Use for platforms (like Framer) where parent containers group visually coupled layers.
    // Default: false.
    "disableUnwrap": false
  },

  // Cookie banner handling is automatic via `.ai/adapters/cookie-consent.json`.
  // Do NOT add `cookieBanner` fields to framework or CMS adapters.

  // Style extraction hints
  "styles": {
    // Map platform wrapper classes to Tailwind equivalents
    // Used to collapse wrapper-soup into single class strings
    "wrapperMappings": [
      { "classPattern": "container-large", "tailwindClasses": "max-w-[1280px] mx-auto w-full" }
    ],

    // Prefix for scoped style classes to strip from labels (e.g., "svelte-", "data-v-")
    "scopedStylePrefix": null,

    // Selectors for global layout elements (framework-specific)
    "globalSelectors": {
      "containerMax": null,
      "paddingGlobal": null
    }
  },

  // Image extraction hints
  "images": {
    // Regex patterns for CDN URLs (used to identify platform-served images)
    "cdnPatterns": ["cdn\\.example\\.com/[a-f0-9]+"],

    // Regex for asset IDs in URLs (e.g., UUID patterns)
    "assetIdPattern": null,

    // How images are lazy-loaded
    "lazyLoadStrategy": "native | intersection-observer | scroll-trigger | none",

    // URL parameter format for responsive images (null if not applicable)
    // Examples: "?w={w}&h={h}&fm={fm}&q={q}" or null
    "responsiveFormat": null
  },

  // Animation extraction hints
  "animations": {
    // Animation engine used by the platform
    "engine": "ix2 | css-transitions | framer-motion | gsap | svelte-transition | vue-transition | none",

    // JS expression to access animation data (e.g., "window.Webflow.require('ix2')")
    "dataSource": null,

    // Default transition duration if platform has a standard (e.g., "275ms")
    "transitionProperty": null
  },

  // Platform-specific gotchas
  "quirks": [
    {
      "id": "quirk-id",
      "description": "What the quirk is and when it triggers",
      "workaround": "How extraction scripts handle it"
    }
  ],

  // Hints for verifying the LOCAL migrated site (not the reference)
  "localSite": {
    // Section selector for the Next.js migrated version
    "sectionSelector": "body > header, body > nav, main > *, body > footer",

    // JS to hide Next.js dev tools overlay during screenshots
    "devToolsHideScript": "document.querySelectorAll('nextjs-portal, [data-nextjs-toast], button[data-nextjs-dev-tools-button]').forEach(el => el.style.display = 'none')"
  },

  // Optional. Declares elements that change on every page load and should be
  // masked during visual verification. Auto-detection covers most cases
  // (infinite CSS animations, autoplay video, GIFs, GSAP timelines).
  // Use this for edge cases.
  "dynamicElements": [
    { "selector": ".custom-ticker", "reason": "JS-driven text rotation" }
  ]
}
```

## How to determine each field

| Field | How to find the value |
|-------|----------------------|
| `detection.jsMarkers` | Open browser console on a live site, check for framework globals (`window.__NEXT_DATA__`, `window.__NUXT__`, etc.) |
| `detection.domMarkers` | Inspect HTML for framework-specific attributes (`data-v-*`, `data-astro-cid-*`, `[data-wf-site]`) |
| `detection.urlPatterns` | View page source, search for CDN domains in `<img src>`, `<link href>`, inline styles |
| `sectionDiscovery` | Inspect DOM tree — how are sections structured? Direct body children? Inside a wrapper? |
| `sectionDiscovery.minExpectedSections` | Count visible sections on the reference site. Set to that count or slightly below. Default 3 is fine for most platforms. Increase for platforms that wrap content in few top-level containers (e.g., Framer: 5+) |
| `sectionDiscovery.disableUnwrap` | Set `true` if the platform uses absolute positioning to compose visual layers within a parent. Prevents splitting visually coupled elements into separate sections |
| `styles.wrapperMappings` | Inspect common wrapper divs — do they add padding/max-width? Map to Tailwind equivalents |
| `styles.scopedStylePrefix` | Check if framework adds scoped hashes to class names (Svelte: `svelte-*`, Vue: `data-v-*`) |
| `images.cdnPatterns` | View source, find `<img>` src patterns. Look for CDN domains and path structures |
| `images.responsiveFormat` | Check if the CDN supports URL params for width/height/format (docs or inspect srcset) |
| `animations.engine` | Check framework docs. Inspect for animation libraries in page source |
| `quirks` | Found through extraction experience. Document anything that breaks or needs special handling |
| `dynamicElements` | Elements that produce non-deterministic renders (JS tickers, random hero images). Only needed for edge cases missed by auto-detection |

## Validation — HARD GATE (10 sites required)

Before an adapter is considered ready to merge:

1. **Curate 10 live sites** using this platform. Sources:
   - Framework showcase/gallery pages (e.g., framer.com/gallery, webflow.com/made-in-webflow)
   - "Built with X" directories (builtwith.com, etc.)
   - GitHub awesome lists (awesome-nextjs, awesome-gatsby, etc.)
   - Web search: `"built with <platform>" site portfolio`

2. **Add sites to the adapter** in a `validation.sites` array:
   ```json
   {
     "platform": "...",
     "validation": {
       "sites": [
         "https://site1.com",
         "https://site2.com",
         "...8 more"
       ]
     },
     ...
   }
   ```

3. **Run validation:**
   ```bash
   pnpm ts scripts/validate-adapter.ts .ai/adapters/<name>.json
   ```

4. **Pass criteria:**
   - **Framework adapters:** all 10 must be detected, ≥8 must produce 3-30 sections
   - **CMS adapters:** all 10 must be detected

5. If validation fails (<8/10 for framework, <10/10 for CMS):
   - Investigate failures — is the adapter wrong or is the site non-standard?
   - Fix the adapter and re-validate
   - Do NOT merge a failing adapter

6. The script saves results to `validation.results` in the adapter JSON automatically.

**Old single-site validation is NOT sufficient.** The framer adapter passed single-site validation but broke on 100% of real Framer sites.
