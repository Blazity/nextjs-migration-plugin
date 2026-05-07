# Lessons

Append a new entry whenever you discover a non-obvious maintainer pitfall. Lead with the rule, then a `Why:` line, then a `How to apply:` line. Runtime migration lessons that should be injected into user migrations belong in `knowledge/lessons.md`; this file is for agents maintaining this repository.

Entries are reverse-chronological.

---

## 2026-05-07 - Keep Vitest Coverage Under Test Directory

**Rule:** Put new Vitest regression tests under `test/**/*.test.ts` unless the test command/config is explicitly changed.

**Why:** This repository's `pnpm test` includes only `test/**/*.test.ts`. Passing a path under `scripts/tests/` can print "No test files found" while exiting 0 because `--passWithNoTests` is enabled.

**How to apply:** When adding script-helper coverage, import the script helper from a `test/*.test.ts` file or update the Vitest include pattern as part of the same task.

## 2026-05-07 - Remove Stale Verification Markers On Failed Reruns

**Rule:** When a phase rerun writes `verification.json` with `passed: false`, delete any stale `VERIFICATION.md` for that phase.

**Why:** `/migrate:continue` uses `VERIFICATION.md` as the completion marker. If a later rerun fails but leaves an old markdown marker behind, the workflow falsely treats the phase as complete and skips the failed gate.

**How to apply:** Keep `verification.json` as the current truth and let `writeVerification` remove stale markdown on failure before returning.

## 2026-05-07 - Next Local Verification Must Capture Wrapped Nav Shells

**Rule:** The Next local verification selector must include body-level wrappers that contain a `nav`, not only direct `body > nav` elements.

**Why:** Phase 5 emits layout shells from extracted source structure. A navigation shell may render as `<div><nav>...</nav></div>` and still be the correct nav section. A selector that only captures `body > nav` reports one fewer meaningful local section and surfaces it as missing `content`.

**How to apply:** Keep `adapters/nextjs.json` local selector aligned with generated layout-shell shapes; for wrapped nav shells use `body > div:has(nav):not(:has(main)):not(:has(footer))`.

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
