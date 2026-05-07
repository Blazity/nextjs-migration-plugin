# Phase 6 (Visual Polish) — pitfalls

## Phase 6 is not full pixel-perfect completion

`/migrate:polish [slug|--all]` currently runs Phase 6 Visual only. It does not complete Phase 7 Animate or Phase 8 Perf. Always report those phases as pending until their dedicated implementations exist.

## Browser/MCP loop is a hard precondition

Visual polish follows the old `nextjs-migration-agent` live-inspection loop: compare reference and local in a browser, change one thing, verify, and revert if worse. Do not fall back to batch-only diff reports or script-only verification when browser tooling is unavailable.

## Do not copy unsafe computed layout values

Never copy computed `width`, `height`, `gridTemplate*`, `position`, `top`, `right`, `bottom`, or `left` values from the reference. These were known to break migrated layouts. Fix layout intent with React/Tailwind structure and verify visually.
