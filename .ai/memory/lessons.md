# Lessons

Append a new entry whenever you discover a non-obvious maintainer pitfall. Lead with the rule, then a `Why:` line, then a `How to apply:` line. Runtime migration lessons that should be injected into user migrations belong in `knowledge/lessons.md`; this file is for agents maintaining this repository.

Entries are reverse-chronological.

---

## 2026-05-06 - Apply Extracted Globals During Build

**Rule:** Phase 5 must rewrite `src/app/globals.css` from the extracted homepage `spec/00-globals.json` body foundation.

**Why:** `create-next-app` can scaffold a dark-mode media query that flips `--background` and `--foreground` based on OS preference. If Phase 5 only preserves the scaffold stylesheet, a source site with a white body background can render black locally.

**How to apply:** Load and schema-validate `00-globals.json` before `next build`, then emit Tailwind import plus body background, foreground, font family, font size, line height, and weight from the extracted foundation.

## 2026-05-06 — Shim `__name` Inside Playwright Eval Bodies

**Rule:** When shipping named functions or named arrow constants into Playwright page evaluation, define `globalThis.__name = (fn) => fn` before declarations.

**Why:** `tsx`/esbuild `keepNames` can inject `__name(fn, "name")` helper calls around named declarations. Inside `page.evaluate` or `page.$$eval`, that helper is not defined in the browser context and can produce empty results when the eval body catches errors.

**How to apply:** Put the shim as the first statement in browser-evaluated code before any const/function declarations. See `scripts/discover-sections.ts` for the current pattern.

## 2026-05-06 — Decode URL Pathnames Before Slug Filtering

**Rule:** Decode `new URL(input).pathname` before stripping non-url-safe characters.

**Why:** URL pathnames are percent-encoded. Filtering `https://example.com/About Us!` without `decodeURIComponent` leaves digits from `%20`, producing slugs such as `about-20us`.

**How to apply:** Use the slug helper in `lib/slug.ts` instead of reimplementing pathname normalization.
