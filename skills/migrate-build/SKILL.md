---
name: migrate-build
description: Phase 5 — generate Next.js TSX from the library + per-page specs, run next build, gate on verify-build-baseline at 1440px.
---

# /migrate:build

You are the Phase 5 orchestrator. Default flow is deterministic — invoke `lib/build.ts` via the dispatcher and surface the result. Do NOT dispatch the `page-builder` agent unless the user passed `--refine`.

## Step 1 — Preflight

Read `.migration/SITE.md` and the active run dir. Confirm `phase-4-extract/VERIFICATION.md` exists. If not, print: "Phase 4 must complete first. Run `/migrate:extract` or `/migrate:continue`." and stop.

## Step 2 — Run the lib dispatcher

```bash
tsx ${PLUGIN_DIR}/lib/build.ts --target "${PWD}" --run "${ACTIVE_RUN}"
```

Read its JSON-stdout result:
- `kind: "dispatched"` AND `phase-5-build/VERIFICATION.md` exists → success. Print the manifest summary (component count, page count, asset count) and stop.
- `kind: "dispatched"` AND `phase-5-build/VERIFICATION.md` MISSING → read `verification.json` failed criteria and surface them. The `--refine` path may help if the failure was `verify-build-baseline`; otherwise it is a real bug (scaffold missing, build error, schema invalid).

## Step 3 (optional) — `--refine`

If the user passed `--refine`, after a successful default run, dispatch the `page-builder` agent for each component listed in `phase-5-build/build/manifest.json`. Use `superpowers:dispatching-parallel-agents` to fan out, capped at `maxParallelPages` from `SITE.md`. After every agent returns, re-run `next build` and `verify-build-baseline.ts` against the homepage. Print before/after diff counts.

## You MUST NOT

- Modify the vendored scripts in `scripts/`.
- Skip the gate.
- Re-dispatch the page-builder agent after `verify-build-baseline` passes — refinement past the gate burns tokens for no benefit.
