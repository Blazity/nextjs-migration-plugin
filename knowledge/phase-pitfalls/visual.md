# Phase 6 (Visual Polish) — pitfalls

## Phase 6 is not full migration completion

`/migrate:polish [slug|--all]` currently runs Phase 6 Visual only. It does not complete Phase 7 Animate or Phase 8 Perf. Always report those phases as pending until their dedicated implementations exist.

## Browser/MCP loop is a hard precondition

Visual polish follows the old `nextjs-migration-agent` live-inspection loop: compare reference and local in a browser, change one thing, verify, and revert if worse. Do not fall back to batch-only diff reports or script-only verification when browser tooling is unavailable.

## Do not copy unsafe computed layout values

Never copy computed `width`, `height`, `gridTemplate*`, `position`, `top`, `right`, `bottom`, or `left` values from the reference. These were known to break migrated layouts. Fix layout intent with React/Tailwind structure and verify visually.

## Verify behavior states before final visual polish

Do not treat a static screenshot match as completion for interactive components. First classify components as `static`, `css-state`, `client-state`, `form-integration`, or `motion`. Menus, drawers, tabs, accordions, dialogs, carousels, forms, marquees, reveal effects, and autoplaying media need representative browser checks for their real states before final visual parity refinement.

## Use similarity as readiness and pixel diffs as diagnostics

Component and page verification should surface similarity readiness first. Pixel Diff Diagnostic images and ratios are still useful for locating changed regions, but raw pixel mismatch alone is too sensitive to harmless vertical offsets and sticky-header capture artifacts.
