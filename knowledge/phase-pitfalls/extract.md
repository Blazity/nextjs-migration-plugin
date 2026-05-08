# Phase 4 (Extract) — pitfalls

## Vendored scripts policy

Per spec § 14 the three extract scripts (`extract-styles.ts`, `extract-images.ts`, `extract-animations.ts`) plus the two gate scripts (`validate-extraction.ts`, `qualify-extraction.ts`) are vendored verbatim from `nextjs-migration-agent`. **Do not modify them.** The wrapper layer in `lib/extract-runner.ts` adapts to their existing CLI conventions.

If a vendored script is buggy, fix it in the source repo first, then re-vendor. Patching in the plugin breaks the "plugin is the source of truth going forward" rule from spec § 3.

## CLI quirks the wrapper handles

- **`extract-images.ts` writes binaries under `public/images/` relative to CWD** and `docs/specs/<page>/image-manifest.json` for JSON. The wrapper invokes it with `cwd` set to a per-page `_staging` dir, then moves the manifest into `pages/[slug]/spec/image-manifest.json`. Binaries stay in the staging dir for now; Phase 5 copies them into `<target>/public/`.
- **`extract-styles.ts` accepts viewports.** The wrapper passes `[1440]` by default. Multi-viewport refinement happens in Phase 6 polish; v1 Phase 4 sticks to 1440px (matches `verify-build-baseline` viewport).
- **All three scripts accept `--adapter <path>`.** The wrapper resolves the adapter from `discovery/probe.json[].matchedAdapters[0]` per page. If a page has no matched adapter, that page is skipped (extraction failure logged in `failures.json`).

## Per-step error handling

The runner does NOT throw on individual step failures. Each step's outcome is recorded in `pages/[slug]/manifest.json.errors[]`. The orchestrator decides whether the gate passes based on cross-step state (for example, styles must succeed; images can fail with degraded output; animation extraction failure is non-fatal for the build gate).

- **Styles failure → page is unusable.** The orchestrator marks the page as failed in `extraction/failures.json` and the page-coverage gate criterion fails.
- **Images failure → degraded only when a manifest exists.** `image-manifest.json` records `failedDownloads[]` and Phase 5 can still emit backed local paths for successful assets. If an image manifest is missing or a source URL cannot be mapped, Phase 5 codegen fails loudly; it must not emit placeholder `/images/homepage/*` paths.
- **Animations failure → non-fatal.** The build gate can proceed; animation parity is handled by later refinement.

## Known failure patterns from lessons.md

- **`__name is not defined` in `page.evaluate()` callbacks** (lessons.md #28). Caused by tsx/esbuild's `keepNames` injecting a host-side helper that doesn't exist in the browser context. Fix is in the script (in-page shim); if a script lacks the shim, surface to user as a plugin bug.
- **Lazy-loaded images return 0 results** (lessons.md #3). Adapter must specify `images.lazyLoadStrategy`. The script scrolls + waits before extracting.
- **Webflow CDN 403 on background images** (lessons.md #10). Some `cdn.prod.website-files.com` URLs are blocked. The script keeps the URL in `image-manifest.json`, records the failed download in `failedDownloads[]`, and the Phase 5 asset gate verifies every emitted local reference resolves under `public/`.
- **SPA fallback content extracted across pages** (lessons.md #24). All URLs return the same shell. `validate-extraction.ts` catches duplicate spec hashes — fails fast. Do NOT proceed to Phase 5.
- **Memory leaks from infinite GSAP timelines** (lessons.md #51). Browser contexts accumulate. The orchestrator should run a memory watchdog (32GB threshold on 48GB machine) and kill browser processes if exceeded. Currently NOT implemented in v1; track as a follow-up issue if a real run hits memory pressure.

## Concurrency

`maxParallelPages` defaults to 4 (set in `SITE.md`). Higher values risk:

- Playwright context exhaustion (each context spawns a Chromium process)
- Memory leaks compounding (lessons.md #51)
- Source-site rate limiting (some CDNs throttle aggressive parallel fetches)

Lower values are safer but slow. Real-world tuning: 4 for sites <50 pages; drop to 2 for sites with heavy animations or large image counts.

## component-usage.json semantics

`pages/[slug]/component-usage.json` matches each extracted section to a Phase 2 cluster id by exact `tagSkeleton`. Sections that don't match any cluster end up in `unmatchedSectionIndices`. Common causes:

- **Phase 2 mega-cluster split is incomplete.** Some sections that look like Heroes were grouped under a generic `ContentSection` cluster and don't match the more specific `Hero` tagSkeleton from this page. Surface in plan-checker / Phase 5 UX.
- **Page-unique section.** A section appears on one page only and didn't cluster in Phase 2 (became a singleton). It IS in `components.json` with `unique: true`; the matcher should still find it.
- **Phase 2 ran with composite-shingles fix not applied.** Older runs may carry a few-cluster registry that doesn't capture the page's actual structure. Re-run `/migrate:analyze` to refresh.

## Atomic-commit discipline

Per spec § 4, each page extracted should be committable independently. The orchestrator writes per-page manifests as soon as they complete — `pages/[slug]/manifest.json` exists even if validate/qualify later fail. This means re-running `/migrate:extract` after a partial failure does NOT re-extract pages whose manifest already passed. v1 implementation does not include this skip-existing optimization; track as a follow-up.

## Gate tightness vs site reality

- **`validate-extraction.ts` is strict.** Duplicate hashes always fail. SPA sites with shared content across URLs (e.g., a docs site with the same chrome on every page) may trip this — adjust crawl scope or accept `qualify-extraction` warnings.
- **`qualify-extraction.ts` per-page.** Section count must match the crawl's recorded count. If Phase 1's `crawl.json` recorded a different count than what extraction yields, qualify fails — root cause is Phase 1 / Phase 2 disagreement on what counts as a section, not Phase 4.

## When extraction succeeds but the result is wrong

- Mega-clusters from Phase 2 propagate: many pages produce specs that all map to the same `ContentSection` cluster. Phase 5 will generate one component for many distinct visual patterns.
- Empty `library/layouts.json` slots mean Phase 5 builds pages without a header / footer / nav. Catch with `migration-planner` warnings in Phase 3.
- `component-usage.json` with high `unmatchedSectionIndices` count → Phase 2 cluster registry is too coarse. Re-run `/migrate:analyze` with stricter thresholds, OR ship to Phase 5 anyway and rely on visual diff in Phase 6 to catch.
