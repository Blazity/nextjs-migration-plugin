---
name: migrate-continue
description: Resume the active migration at the first phase missing VERIFICATION.md.
---

# /migrate:continue

You are the orchestrator. You do NOT do phase work yourself — you find the next phase and delegate.

## Step 1 — Resolve next phase

First, check which phase is next WITHOUT yet running its dispatcher. Read `.migration/SITE.md` (for `goal`) and the highest-numbered run dir under `.migration/runs/`. Find the first `phase-N-*` subdir lacking `VERIFICATION.md`. The phase id determines routing in Step 2.

If `.migration/` does not exist → print: "No migration here. Run `/migrate:new <url>`." and stop.
If every in-scope phase has `VERIFICATION.md` → print: "All phases complete for run [runDir]. Run `/migrate:ship` for the final report." and stop.

## Step 2 — Route to the right runner

Phase routing depends on whether the phase needs LLM refinement:

| Next phase | Runner | Why |
|---|---|---|
| `phase-1-discover` | `tsx ${PLUGIN_DIR}/lib/continue.ts --target "${PWD}"` | Deterministic crawl + probe. No LLM needed. |
| `phase-2-analyze` | **Invoke `/migrate:analyze` skill instead** | Algorithmic pass plus 4 sub-agent dispatches (`layout-extractor` → `component-deduper` → `prop-classifier` → `route-mapper`). The CLI dispatcher in `lib/continue.ts` runs only the algorithmic half — that produces a passing schema gate but useless layouts/components. The `/migrate:analyze` skill orchestrates the LLM refinement on top. |
| `phase-3-plan` | **Invoke `/migrate:plan` skill instead** | Algorithmic build-order pass plus 2 sub-agent dispatches (`migration-planner` → `plan-checker`). The CLI dispatcher in `lib/continue.ts` runs only the algorithmic half. In `attended` mode the algorithmic-only path fails the user-approval criterion intentionally; the `/migrate:plan` skill collects approval and re-runs `--refine-only --confirm-roadmap` to close the gate. |
| `phase-4-extract` | `tsx ${PLUGIN_DIR}/lib/continue.ts --target "${PWD}"` OR `/migrate:extract` skill | Per-page extraction is deterministic; the lib dispatcher's bounded-concurrency loop handles the parallel-by-page work. Invoke the `/migrate:extract` skill only when the site is large or extraction is known-flaky and per-page LLM-side triage is needed. Default: lib dispatcher. |
| `phase-5-build` | `tsx ${PLUGIN_DIR}/lib/continue.ts --target "${PWD}"` OR `/migrate:build` skill | Codegen is deterministic; the lib dispatcher runs `generate-jsx.ts` per page, assembles routes, runs `next build`, and runs `verify-build-baseline` against the homepage. Invoke the `/migrate:build` skill ONLY if the user passed `--refine` or the gate failed on `verify-build-baseline` and pixel-perfect refinement is wanted (Phase 5's gate accepts wireframe quality on the homepage; per-page polish is Phase 6). Default: lib dispatcher. |
| `phase-6-visual+` | (Not yet implemented — Plan 7+.) | Print which phase is next and ask the user: "Run `/migrate:[next-phase]` manually." |

For phase-1, run the bash command and read its JSON output:
- `kind: "dispatched"` — the registered dispatcher ran. Print the result and stop. User runs `/migrate:continue` again to advance.
- `kind: "no-dispatcher"` — phase has no library-level dispatcher. Surface which phase + ask the user.

For phase-2, follow the `/migrate:analyze` skill end to end. Do NOT call `lib/continue.ts` for phase-2; its dispatcher would skip the LLM step.

For phase-3, follow the `/migrate:plan` skill end to end. Do NOT call `lib/continue.ts` for phase-3 in attended mode; its dispatcher would fail the user-approval criterion. In unattended mode the dispatcher's algorithmic pass is sufficient — the user-approval criterion auto-confirms — but the skill still produces better roadmap names because it dispatches `migration-planner`.

For phase-4, the lib dispatcher is the default — extraction is deterministic and parallelism is handled by `lib/extract.ts`'s bounded-concurrency loop. The `/migrate:extract` skill exists for large or flaky sites where per-page LLM-side triage is worth the dispatch cost; in that case follow the skill end to end.

## Step 2 — In unattended mode, loop

If `SITE.md` has `mode: unattended` AND the result was `dispatched`, immediately re-invoke `/migrate:continue` (use the `superpowers:dispatching-parallel-agents` pattern only when the next phase fans out — phase 1 does not). Stop on `all-done`, `no-dispatcher`, or any failed gate.

In attended mode, do not auto-loop. Print and yield control.

## You MUST NOT

- Skip the verification gate. If the dispatched phase did not produce `VERIFICATION.md`, the gate failed — read the `verification.json` failed criteria and surface them to the user.
- Mutate `SITE.md`.
