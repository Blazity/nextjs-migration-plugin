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

## Step 4 — Refine with sub-agents (LLM-driven)

Step 3 produced the algorithmic-first-pass output. The four sub-agents below refine it by reading the cluster summaries (NOT full DOM specs) and rewriting the corresponding library JSONs in place. Dispatch them in order via the Task tool. Each agent inherits no prior context — pass exactly the inputs listed.

### Step 4.1 — `layout-extractor`

Read `runs/<runDir>/phase-2-analyze/analysis/clusters.json` and the current `library/layouts.json`. Dispatch the `layout-extractor` agent with:

- `clusters` — full `clusters.json.clusters` array (each cluster: `{ id, representative: { tagSkeleton, pathShingles }, memberIds[] }`)
- `pageCount` — number of pages in `runs/<runDir>/phase-1-discover/discovery/crawl.json`
- `existingLayouts` — current `library/layouts.json` contents

Agent rewrites `library/layouts.json` to satisfy `LayoutsSchema` (header / footer / nav slots, each null or a `LayoutShell`).

### Step 4.2 — `component-deduper`

Read `runs/<runDir>/phase-2-analyze/analysis/clusters.json` (for `clusters` + `ambiguousPairs` + `unique`) and the current `library/components.json`. Dispatch the `component-deduper` agent with:

- `clusters`, `ambiguousPairs`, `unique` — all from clusters.json
- `pageCount` — same as Step 4.1
- `existingComponents` — current `library/components.json` contents

Agent rewrites `library/components.json` to satisfy `ComponentsSchema`. Component names should be meaningful (`Hero`, `PricingTable`, `CaseStudyCard`) — no `Div`/`Section` placeholders. Layout-shell cluster IDs (those promoted in Step 4.1) MUST be excluded.

### Step 4.3 — `prop-classifier`

Read the refined `library/components.json` and per-cluster sample text (at most 200 chars per member, drawn from `runs/<runDir>/phase-2-analyze/analysis/sections.json`). Dispatch the `prop-classifier` agent with:

- For each component cluster: `{ name, tagSkeleton, memberSections: [{ id, url, sampleText }] }`
- Cap sample text per member at 200 chars

Agent rewrites `library/props.json` to satisfy `PropsRegistrySchema`. Empty `fields: []` is acceptable for single-member or unique clusters.

### Step 4.4 — `route-mapper`

Read the current `library/routes.json` and the `runs/<runDir>/phase-1-discover/discovery/crawl.json` metadata (page titles + depths). Dispatch the `route-mapper` agent with:

- `routes` — current `library/routes.json.routes` array
- `crawl` — pages array from crawl.json

Agent rewrites `library/routes.json` to satisfy `RoutesSchema`. Trust the algorithm by default; only demote false-positive `[slug]` groups.

### Cost bound (spec § 11.4)

Every dispatch must pass cluster summaries / route data only. NEVER pass full `sections.json` (it is large — KB to MB) or the full crawl page graph. Each agent prompt explicitly lists what it should NOT receive.

## Step 5 — Re-run the verification gate

After all four agents have written their outputs, re-validate via the `--refine-only` flag. This skips the section probe + clustering and just re-checks the gate criteria against the now-refined library JSONs:

```bash
tsx ${PLUGIN_DIR}/lib/analyze.ts \
  --target "${TARGET_DIR}" \
  --run "${RUN_DIR}" \
  --refine-only
```

The script re-emits `verification.json` (always) and rewrites `VERIFICATION.md` (only if gate passes).

If `VERIFICATION.md` exists, print:

> Analyze complete: N components, M routes, K layout shells. Run `/migrate:status` or `/migrate:continue` to proceed to Phase 3 (Plan).

If the gate did not pass, surface the failing criteria from `verification.json` and stop.

## You MUST NOT

- Skip the page-coverage gate. Every URL in `crawl.json` MUST appear in `routes.json`.
- Modify `crawl.json` or `probe.json`.
- Invoke any other phase.
