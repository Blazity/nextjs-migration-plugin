# Phase 3 (Plan) — pitfalls

## Algorithmic pass vs LLM refinement — dual-mode

`lib/plan.ts` runs the **algorithmic build-order computation only**: read library + crawl + SITE.md → topologically sort layouts → components → pages → polish (when pixel-perfect) → write `ROADMAP.md` with placeholder names. Output passes the schema gate but components carry the same placeholder names that survived `/migrate:analyze` (e.g., `Div`, `Section`, `ContentSection`).

The two sub-agents (`migration-planner`, `plan-checker`) refine the roadmap. They are **dispatched by the `/migrate:plan` skill**, not invoked by `lib/plan.ts`. The skill flow is:

1. `tsx lib/plan.ts ...` — algorithmic pass (writes `ROADMAP.md` + phase artifacts)
2. Skill dispatches `migration-planner` to refine names + add `dependsOn` + populate `resolvedQuestions`
3. Skill dispatches `plan-checker` to goal-backward-review the refined roadmap
4. Skill collects user approval (attended) or auto-confirms (unattended)
5. `tsx lib/plan.ts ... --refine-only --confirm-roadmap` — re-runs the gate

`/migrate:continue` MUST route phase-3 to the `/migrate:plan` skill in attended mode. In unattended mode the algorithmic dispatcher is sufficient (the user-approval criterion auto-confirms) but skipping the skill means inferior names ship to Phase 5.

## Build-order semantics

- **Layouts always sort before components.** Pages depend on every layout shell + every component (v1 conservative model). If layouts.json has all-null slots, that's fine — buildOrder simply omits the layout entries and pages depend on components only.
- **Components are alphabetized by name** in v1. Once `migration-planner` learns to detect inter-component dependencies (`CaseStudyGrid` renders `CaseStudyCard`), the order becomes a real topological sort. The schema accepts this — `dependsOn` is already array-typed.
- **Pages depend on EVERYTHING.** A page entry's `dependsOn` lists every layout-shell id and every component id. This is intentional v1 conservatism — it guarantees Phase 5 builds shells + components first, regardless of which page actually renders which. v2 may narrow per-page deps using `pages/[slug]/component-usage.json` from Phase 4.
- **Polish entries depend on their page.** A `polish:<sourceUrl>` entry depends only on the page id, not on every component. This means polish for Page A can run in parallel with polish for Page B once both pages are built.

## Cycle detection

- **`detectCycles` ignores unknown ids.** A `dependsOn` entry whose id is not in the build-order is silently dropped — it cannot create a cycle. This is by design: Phase 4+ may add post-hoc dependencies via `notes` references that mention historical ids (e.g., resolved variants from a delta run). Cycles only fire among ids actually present.
- **`acyclic` is a hard gate.** No `passed: true` if any cycle exists. The script outputs the cycle as `id-A -> id-B -> id-A` in `verification.json.criteria[].detail` so the user can hand-edit ROADMAP.md.

## ROADMAP.md location quirk

Per spec § 4, `ROADMAP.md` lives at `runs/<runDir>/ROADMAP.md` (run top level), NOT inside `phase-3-plan/`. The phase dir holds only `PLAN.md` / `EXECUTION.md` / `VERIFICATION.md` / `verification.json`. Phases 4-5 read `ROADMAP.md` from the run top level.

## Frontmatter is the source of truth

`ROADMAP.md` has YAML frontmatter (machine-parsed by `loadRoadmap` for `plan-checker`) plus a markdown body (human-readable build-order list). `migration-planner` MUST keep both in sync — when it adds a `dependsOn`, both the frontmatter array and the body markdown line should reflect it. The current orchestrator regenerates the body from frontmatter; agents that hand-edit the body without updating frontmatter will produce a passing gate that ships a misleading body.

## Gate criteria

- **`every page in crawl.json has an entry in routes.json`** — re-checks the same gate criterion from Phase 2 because the user may have hand-edited `routes.json` between Phase 2 and Phase 3. Catches that drift.
- **`every component has a build-order entry`** — fails when `lib/build-order.ts` skipped a component. Should never fail in v1 (the algorithm enumerates every entry); fails if a future change adds filtering.
- **`every non-null layout slot has a build-order entry`** — same shape as the components check, scoped to layouts.
- **`build-order is acyclic`** — hard gate, see above.
- **`user approved the roadmap`** — auto-pass in unattended; requires explicit `confirmRoadmap` in attended. The `/migrate:plan` skill's user-prompt step is what closes this gate.

## Open issues that may surface

- **Layout-extractor placeholder leaks.** If `layouts.json.header` is `null` because `extract-layouts` heuristic was too strict (ISSUE-003), the roadmap simply omits the header entry. Pages will render without a header in Phase 5. `migration-planner` should flag this as a `notes` warning on the page entries when no header shell is present.
- **Mega-cluster placeholder names.** If Phase 2 shipped a cluster with a generic name like `ContentSection` covering many distinct visual patterns, the roadmap will carry that one entry forward. `plan-checker` flags placeholder-style names; the user should re-run Phase 2 with `/migrate:analyze` to refine the cluster before Phase 3 finalizes.
