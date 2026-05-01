---
name: migrate-plan
description: Run Phase 3 (Plan) — synthesize the analyzed library into a goal-backward roadmap, gate on user approval + acyclic build order.
---

# /migrate:plan

You are running Phase 3 explicitly. Phase 3 is a decision phase — no DOM extraction, no codegen. The output is `runs/<runDir>/ROADMAP.md`, the source of truth for Phases 4-5.

## Step 1 — Verify preconditions

Read `.migration/SITE.md`. If it does not exist, abort: "No migration in this directory. Run `/migrate:new <url>`."

Read `.migration/runs/<runDir>/phase-2-analyze/VERIFICATION.md`. If it is missing, abort: "Phase 2 must complete first. Run `/migrate:analyze` or `/migrate:continue`."

If `runs/<runDir>/phase-3-plan/VERIFICATION.md` already exists, ask: "Phase 3 already verified. Re-run? (yes / no)" — abort on no.

## Step 2 — Run the algorithmic-first-pass

```bash
tsx ${PLUGIN_DIR}/lib/plan.ts \
  --target "${TARGET_DIR}" \
  --run "${RUN_DIR}"
```

This writes:

- `runs/<runDir>/phase-3-plan/PLAN.md`
- `runs/<runDir>/phase-3-plan/EXECUTION.md`
- `runs/<runDir>/ROADMAP.md` — the draft roadmap (frontmatter validates against `RoadmapSchema`; body is human-readable build order)
- `runs/<runDir>/phase-3-plan/verification.json` (always)
- `runs/<runDir>/phase-3-plan/VERIFICATION.md` (only on gate pass — in `attended` mode this REQUIRES user approval, so the first pass typically does NOT produce VERIFICATION.md)

## Step 3 — Refine with sub-agents (LLM-driven)

Build digest payloads — DO NOT pass the raw library/crawl JSONs to agents. Pass:

- For `migration-planner`: the current ROADMAP.md frontmatter, plus a `librarySummary` object: `{ layouts: { header: bool, footer: bool, nav: bool }, components: [{ id, name, memberCount, propsRef }], routes: [{ sourceUrl, nextRoute, kind }] }`, plus a `crawlSummary` array of `{ url, depth, slug }` per page.
- For `plan-checker`: the refined ROADMAP.md path only.

### Step 3.1 — `migration-planner`

Dispatch the `migration-planner` agent with the digests and the path to `ROADMAP.md`. The agent rewrites the file in place — refining names, adding `dependsOn` where evidence-backed, populating `resolvedQuestions[]` (asking the user in `attended` mode, accepting defaults in `unattended`).

### Step 3.2 — `plan-checker`

Dispatch the `plan-checker` agent with the refined ROADMAP.md path. The agent returns `{ passed, issues[], summary }`.

If `passed: false` with blockers, surface the blockers to the user. If `attended`, ask: "Re-run migration-planner with these blockers as input? (yes / no)". On yes, re-dispatch `migration-planner`; on no, abort the skill.

If `passed: true`, proceed.

### Step 3.3 — User approval (attended mode only)

In `attended` mode, print a one-paragraph summary of the roadmap (component count, page count, polish phase count, resolved-question count) and ask: "Approve this roadmap and proceed to Phase 4? (yes / no — edit ROADMAP.md and re-run /migrate:plan)". On yes, set the `confirmRoadmap` flag for Step 4. On no, abort.

In `unattended` mode, the gate auto-confirms.

## Step 4 — Re-run the gate via `--refine-only`

```bash
tsx ${PLUGIN_DIR}/lib/plan.ts \
  --target "${TARGET_DIR}" \
  --run "${RUN_DIR}" \
  --refine-only \
  --confirm-roadmap
```

The script re-validates the ROADMAP.md frontmatter, re-runs the gate, and rewrites `verification.json` + (on pass) `VERIFICATION.md`.

If `VERIFICATION.md` exists, print:

> Plan complete. Roadmap at `.migration/runs/<runDir>/ROADMAP.md`. Run `/migrate:status` or `/migrate:continue` to proceed to Phase 4 (Extract — not yet implemented).

If the gate did not pass, surface the failed criteria from `verification.json` and stop.

## Cost bound (spec § 11.4)

Every dispatch must pass digests, not full JSONs. The roadmap itself is small (KB) and is the only file the agents directly edit.

## You MUST NOT

- Pass full `library/*.json` or `discovery/crawl.json` to agents — only digests.
- Skip the user-approval gate in attended mode.
- Modify any artifact outside `runs/<runDir>/ROADMAP.md` and the phase-3 dir.
