---
name: migrate-extract
description: Run Phase 4 (Extract) — invoke per-page extract scripts, populate pages/[slug]/spec/, gate on validate-extraction + qualify-extraction.
---

# /migrate:extract

You are running Phase 4 explicitly. Phase 4 is data extraction — no codegen. Output is `.migration/pages/[slug]/spec/` populated with styles, images, animations, structure for every URL in `library/routes.json`.

## Step 1 — Verify preconditions

Read `.migration/SITE.md`. If it does not exist, abort: "No migration in this directory. Run `/migrate:new <url>`."

Read `.migration/runs/<runDir>/phase-3-plan/VERIFICATION.md`. If missing, abort: "Phase 3 must complete first. Run `/migrate:plan` or `/migrate:continue`."

If `runs/<runDir>/phase-4-extract/VERIFICATION.md` already exists, ask: "Phase 4 already verified. Re-run? (yes / no)" — abort on no.

## Step 2 — Run the extractor

```bash
tsx ${PLUGIN_DIR}/lib/extract.ts \
  --target "${TARGET_DIR}" \
  --run "${RUN_DIR}"
```

This:
- Reads `library/routes.json` for the page list
- Reads `discovery/probe.json` for per-URL adapter
- Reads `discovery/crawl.json` for per-URL slug
- For each page, invokes `scripts/extract-styles.ts` + `scripts/extract-images.ts` + `scripts/extract-animations.ts`, capped at `maxParallelPages`
- Writes `pages/[slug]/spec/` per page, including per-section styles/structure/animations plus `image-manifest.json` (or legacy `images.json`) and `00-globals.json`
- Writes `pages/[slug]/manifest.json` per page with stats + errors
- Writes `pages/[slug]/component-usage.json` matching extracted sections to library cluster ids
- Runs `scripts/validate-extraction.ts` and `scripts/qualify-extraction.ts` as gates
- Writes `phase-4-extract/extraction/manifest.json` + `failures.json` + `verification.json` + (on pass) `VERIFICATION.md`

Wall-clock: ~3-8 seconds per page, parallelized at `maxParallelPages` (default 4). For a 47-page site at default cap, expect ~1-2 minutes.

## Step 3 — Triage failures

If `verification.json.passed === false`, read `extraction/failures.json` and `pages/[slug]/manifest.json` per page to see which step failed. Common patterns are catalogued in `knowledge/phase-pitfalls/extract.md`. Surface failures to the user before re-running; do not silently auto-confirm failed extraction.

## Step 4 — Optional LLM-side fan-out (large sites only)

For sites with >100 pages or known-flaky extraction (mixed SPA + static), dispatch `page-extractor` agent instances via `superpowers:dispatching-parallel-agents`. Each agent handles one page and surfaces step-level errors for retry decisions. v1 default does NOT use this — the lib orchestrator's bounded-concurrency loop is sufficient.

## Step 5 — Report

If `VERIFICATION.md` exists, print:

> Extract complete: N pages, M failures. Specs at `.migration/pages/`. Run `/migrate:status` or `/migrate:continue` to proceed to Phase 5 (Build — not yet implemented).

If the gate did not pass, surface failed criteria from `verification.json` and stop.

## You MUST NOT

- Modify `scripts/*` or `scripts/lib/*` — per spec § 14 vendored verbatim.
- Mutate `library/*.json` — Phase 4 is read-only on the library.
- Skip the gate — `validate-extraction` catches SPA-fallback duplicates (lessons.md #24); `qualify-extraction` catches structural drift.
- Invoke any other phase.
