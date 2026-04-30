---
name: migrate-analyze
description: Run Phase 2 (Analyze) — cluster sections across crawled pages, build the shared component library, gate on routes.json + cluster coverage.
---

# /migrate:analyze

You are running Phase 2 explicitly. Delegate the section-clustering to the algorithmic pipeline (`lib/analyze.ts`), then refine via the four sub-agents.

## Step 1 — Verify preconditions

Read `.migration/SITE.md`. If it does not exist, abort with: "No migration in this directory. Run `/migrate:new <url>`."

Read `.migration/runs/<runDir>/phase-1-discover/VERIFICATION.md`. If it is missing, abort with: "Phase 1 must complete first. Run `/migrate:discover` or `/migrate:continue`."

If `runs/<runDir>/phase-2-analyze/VERIFICATION.md` already exists, ask the user: "Phase 2 already verified. Re-run? (yes / no)" — abort on no.

## Step 2 — Resolve the adapter's primarySelector

Read `runs/<runDir>/phase-1-discover/discovery/probe.json`. Take `pages[0].matchedAdapters[0]` as the adapter path. Load that adapter (`AdapterSchema`-validated). Use its `sectionDiscovery.primarySelector` (or `sectionDiscovery.selector`, whichever the adapter ships) as the primary selector for the section probe.

## Step 3 — Run the analyze script

```bash
tsx ${PLUGIN_DIR}/lib/analyze.ts \
  --target "${TARGET_DIR}" \
  --run "${RUN_DIR}" \
  --selector "<primarySelector>"
```

This writes:
- `runs/<runDir>/phase-2-analyze/PLAN.md`
- `runs/<runDir>/phase-2-analyze/EXECUTION.md`
- `runs/<runDir>/phase-2-analyze/analysis/sections.json`
- `runs/<runDir>/phase-2-analyze/analysis/clusters.json`
- `library/layouts.json`, `library/components.json`, `library/props.json`, `library/routes.json`
- `library/HISTORY.md` (appended)
- `runs/<runDir>/phase-2-analyze/verification.json` (always)
- `runs/<runDir>/phase-2-analyze/VERIFICATION.md` (only on gate pass)

## Step 4 — Refine with sub-agents

The script produces the algorithmic-first-pass output. Refine it by dispatching the four agents in order:

1. `layout-extractor` — promotes layout shells in `layouts.json`
2. `component-deduper` — finalizes component names + ambiguous-pair decisions in `components.json`
3. `prop-classifier` — fills in `props.json` interfaces
4. `route-mapper` — reviews `routes.json`, applies overrides if any

Pass each agent only the cluster summaries / route data it needs — never the full sections.json content.

## Step 5 — Re-run the verification gate

After refinement, re-invoke `lib/analyze.ts` with the same args. The script is idempotent; it re-validates the library JSONs and re-emits the verification.

If `VERIFICATION.md` exists, print:

> Analyze complete: N components, M routes, K layout shells. Run `/migrate:status` or `/migrate:continue` to proceed to Phase 3 (Plan).

If the gate did not pass, surface the failing criteria from `verification.json` and stop.

## You MUST NOT

- Skip the page-coverage gate. Every URL in `crawl.json` MUST appear in `routes.json`.
- Modify `crawl.json` or `probe.json`.
- Invoke any other phase.
