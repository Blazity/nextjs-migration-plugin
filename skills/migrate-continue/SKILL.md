---
name: migrate-continue
description: Resume the active migration at the first phase missing VERIFICATION.md.
---

# /migrate:continue

You are the orchestrator. You do NOT do phase work yourself — you find the next phase and delegate.

## Step 1 — Resolve next phase

First, check which phase is next WITHOUT yet running its dispatcher. Use the highest-numbered run dir under `.migration/runs/`, then walk the known phase order from `phase-1-discover` onward. The first phase whose `VERIFICATION.md` is missing is next; the phase directory itself may not exist yet on a fresh bootstrap. The phase id determines routing in Step 2.

If `.migration/` does not exist → print: "No migration here. Run `/migrate:new <url>`." and stop.
If every phase has `VERIFICATION.md` → print: "All phases complete for run [runDir]." and stop.

Do not invoke `lib/continue.ts` during this step; that script dispatches work. This step is read-only phase detection. Inspect the run directory directly, or use `/migrate:status` for a summary before deciding the route.

## Step 2 — Route to the right runner

Phase routing depends on whether the phase needs LLM refinement:

| Next phase | Runner | Why |
|---|---|---|
| `phase-1-discover` | `tsx ${PLUGIN_DIR}/lib/continue.ts --target "${PWD}"` | Deterministic crawl + probe. No LLM needed. |
| `phase-2-analyze` | **Invoke `/migrate:analyze` skill instead** | Algorithmic pass plus agent refinement for layouts, components, props, and routes. The CLI dispatcher runs only the deterministic half. |
| `phase-3-plan` | **Invoke `/migrate:plan` skill instead** | Algorithmic build-order pass plus optional planner/checker refinement. The CLI dispatcher runs only the deterministic half. |
| `phase-4-extract` | `tsx ${PLUGIN_DIR}/lib/continue.ts --target "${PWD}"` OR `/migrate:extract` skill | Per-page extraction is deterministic; use the skill only when a large or flaky site needs per-page triage. |
| `phase-5-build` | `tsx ${PLUGIN_DIR}/lib/continue.ts --target "${PWD}"` OR `/migrate:build` skill | Codegen is deterministic; use the skill only when the build gate needs refinement. |
| `phase-6-visual` | **Invoke `/migrate:polish --all` skill instead** | Phase 6 hard-requires Playwright MCP-style live browser agents; the CLI dispatcher can only fail the MCP precondition. |
| `phase-7-animate+` | (Not yet implemented — follow-up plan.) | Report that Phase 7 Animate and Phase 8 Perf remain pending. |

For phase-1, run the bash command and read its JSON output:
- `kind: "dispatched"` — the registered dispatcher ran. Print the result and stop. User runs `/migrate:continue` again to advance.
- `kind: "no-dispatcher"` — phase has no library-level dispatcher. Surface which phase and ask the user.

For phase-2, follow the `/migrate:analyze` skill end to end. Do NOT call `lib/continue.ts` for phase-2; its dispatcher would skip the LLM step.

For phase-3, follow the `/migrate:plan` skill end to end when roadmap refinement is useful. The deterministic dispatcher is acceptable for recovery-only algorithmic verification.

For phase-4, the lib dispatcher is the default. The `/migrate:extract` skill exists for large or flaky sites where per-page LLM-side triage is worth the dispatch cost.

For phase-6, follow `/migrate:polish --all` end to end. It creates or reuses a dedicated polish run and runs Phase 6 Visual only. Do NOT call `lib/continue.ts` for Phase 6 unless you are intentionally checking the MCP precondition failure path.

After a dispatch, print the result and yield control. Do not auto-loop.

## You MUST NOT

- Skip the verification gate. If the dispatched phase did not produce `VERIFICATION.md`, the gate failed — read the `verification.json` failed criteria and surface them to the user.
- Do not mark Phase 5 complete when `verify-build-baseline` fails. A failed baseline can be refined or reported, but it is not a completed gate.
- Do not claim the whole migration is complete after Phase 6. Phase 7 Animate and Phase 8 Perf remain pending follow-up phases.
- Mutate `SITE.md`.
