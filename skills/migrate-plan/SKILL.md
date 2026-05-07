---
name: migrate-plan
description: Run Phase 3 (Plan) — synthesize the analyzed library into a verified build roadmap.
---

# /migrate:plan

You are running Phase 3 explicitly as a recovery tool. Phase 3 is a planning phase — no DOM extraction, no codegen. The output is `runs/<runDir>/ROADMAP.md`, a deterministic build-order artifact for the legacy phase chain.

## Step 1 — Verify preconditions

Read `.migration/SITE.md`. If it does not exist, abort: "No migration in this directory. Run `/migrate:new <url>`."

Read `.migration/runs/<runDir>/phase-2-analyze/VERIFICATION.md`. If it is missing, abort: "Phase 2 must complete first. Run `/migrate:analyze` or `/migrate:continue`."

If `runs/<runDir>/phase-3-plan/VERIFICATION.md` already exists, ask: "Phase 3 already verified. Re-run? (yes / no)" — abort on no.

## Step 2 — Run the algorithmic first pass

```bash
tsx ${PLUGIN_DIR}/lib/plan.ts \
  --target "${TARGET_DIR}" \
  --run "${RUN_DIR}"
```

This writes:

- `runs/<runDir>/phase-3-plan/PLAN.md`
- `runs/<runDir>/phase-3-plan/EXECUTION.md`
- `runs/<runDir>/ROADMAP.md` — frontmatter validates against `RoadmapSchema`; body is a human-readable build order
- `runs/<runDir>/phase-3-plan/verification.json`
- `runs/<runDir>/phase-3-plan/VERIFICATION.md` when the deterministic gate passes

## Step 3 — Refine with sub-agents when useful

Build digest payloads — DO NOT pass the raw library/crawl JSONs to agents. Pass:

- For `migration-planner`: the current ROADMAP.md frontmatter, plus a `librarySummary` object: `{ layouts: { header: bool, footer: bool, nav: bool }, components: [{ id, name, memberCount, propsRef }], routes: [{ sourceUrl, nextRoute, kind }] }`, plus a `crawlSummary` array of `{ url, depth, slug }` per page.
- For `plan-checker`: the refined ROADMAP.md path only.

### Step 3.1 — `migration-planner`

Dispatch the `migration-planner` agent with the digests and the path to `ROADMAP.md`. The agent rewrites the file in place — refining names, adding `dependsOn` where evidence-backed, and populating `resolvedQuestions[]` when needed.

### Step 3.2 — `plan-checker`

Dispatch the `plan-checker` agent with the refined ROADMAP.md path. The agent returns `{ passed, issues[], summary }`.

If `passed: false` with blockers, surface the blockers to the user. Ask whether to re-run `migration-planner` with these blockers as input. On yes, re-dispatch `migration-planner`; on no, abort the skill.

If `passed: true`, proceed.

## Step 4 — Re-run the gate via `--refine-only`

```bash
tsx ${PLUGIN_DIR}/lib/plan.ts \
  --target "${TARGET_DIR}" \
  --run "${RUN_DIR}" \
  --refine-only
```

The script re-validates the ROADMAP.md frontmatter, re-runs the deterministic gate, and rewrites `verification.json` plus `VERIFICATION.md` on pass.

If `VERIFICATION.md` exists, print:

> Plan complete. Roadmap at `.migration/runs/<runDir>/ROADMAP.md`. Run `/migrate:status` or `/migrate:continue` to proceed to Phase 4.

If the gate did not pass, surface the failed criteria from `verification.json` and stop.

## Cost bound (spec § 11.4)

Every dispatch must pass digests, not full JSONs. The roadmap itself is small (KB) and is the only file the agents directly edit.

## You MUST NOT

- Pass full `library/*.json` or `discovery/crawl.json` to agents — only digests.
- Modify any artifact outside `runs/<runDir>/ROADMAP.md` and the phase-3 dir.
