# Next.js Migration Plugin — Design Spec

**Date:** 2026-04-21
**Status:** Approved, ready for implementation planning
**Supersedes:** The single-page orchestration model in `nextjs-migration-agent/.ai/skills/`

## 1. Goal

Transform the existing `nextjs-migration-agent` repository — a single-page Next.js migration tool — into a Claude Code plugin that performs **A-to-Z, multi-page migrations** with persistent state, a planning phase, component deduplication, cross-page routing, and incremental delta runs. The tool is modeled on the `gsd-build/get-shit-done` pattern: discrete phases, file-based state, goal-backward verification, resumable via a single `/continue` command.

## 2. Scope

### In scope for v1

- Multi-page migration of public websites to Next.js (App Router)
- Two input modes:
  - `url-only` — source URL only (live crawl)
  - `url-plus-repo` — source URL plus a read-only local path to the source repo
- Two goals:
  - `wireframe` — phases 1-5, stop at rough build
  - `pixel-perfect` — all 8 phases, visual + animation + performance polish
- Two execution modes:
  - `attended` — phases pause at real decision points, ask clarifying questions
  - `unattended` — auto-continue via `/loop`, never block on prompts
- Incremental "delta runs" — add more pages to an existing migration without re-doing completed work
- Component library that evolves across runs, with visual regression protection
- Per-page opt-in polish — `/migrate:polish <slug>` — decoupled from the main phase sequence

### Out of scope for v1 (see § 13 for v2 roadmap)

- Non-Next.js targets
- `content-migration` and `cms-to-cms` modes (schema slots reserved, not implemented)
- Goal presets beyond `wireframe` and `pixel-perfect`
- `--target-url` flag (different source and target domains)
- Multi-site parallel migrations
- Telemetry or automated feedback submission to plugin maintainers
- GUI / web dashboard

## 3. Plugin shape

### Distribution

Sibling repository `nextjs-migration-plugin`, distributed via the standard Claude Code plugin mechanism. **Not** a fork of `nextjs-migration-agent`. The old repo remains as a reference and will be archived after the plugin ships.

```
~/dev/
├── nextjs-migration-agent/         # old repo — reference only, archive after v1 ships
└── nextjs-migration-plugin/        # new, net-new .git, net-new codebase
```

### Plugin directory layout

```
nextjs-migration-plugin/
├── plugin.json                     # name, version, hard deps
├── README.md
├── hooks/
│   └── session-start.js            # validates superpowers installed, injects lessons
├── commands/                       # thin slash-command wrappers
│   ├── migrate-new.md
│   ├── migrate-continue.md
│   ├── migrate-discover.md
│   ├── migrate-analyze.md
│   ├── migrate-plan.md
│   ├── migrate-extract.md
│   ├── migrate-build.md
│   ├── migrate-polish.md
│   ├── migrate-add-pages.md
│   ├── migrate-verify.md
│   ├── migrate-status.md
│   ├── migrate-config.md
│   ├── migrate-library.md
│   ├── migrate-runs.md
│   └── migrate-ship.md
├── skills/                         # one dir per phase + meta-skills
│   ├── migrate-new/
│   ├── migrate-continue/
│   ├── migrate-discover/
│   ├── migrate-analyze/
│   ├── migrate-plan/
│   ├── migrate-extract/
│   ├── migrate-build/
│   ├── migrate-visual/
│   ├── migrate-animate/
│   └── migrate-perf/
├── agents/                         # agent prompt templates
│   ├── site-crawler.md
│   ├── layout-extractor.md
│   ├── component-deduper.md
│   ├── prop-classifier.md
│   ├── route-mapper.md
│   ├── migration-planner.md
│   ├── plan-checker.md
│   ├── adapter-repairer.md
│   ├── state-repairer.md
│   ├── page-extractor.md
│   ├── page-builder.md
│   ├── page-verifier.md
│   ├── page-animator.md
│   ├── page-optimizer.md
│   ├── phase-executor.md
│   └── phase-verifier.md
├── scripts/                        # vendored verbatim from nextjs-migration-agent
│   ├── probe-page.ts
│   ├── extract-styles.ts
│   ├── extract-images.ts
│   ├── extract-animations.ts
│   ├── verify-visual.ts
│   ├── verify-visual-golden-spa.ts
│   ├── compare-rendered.ts
│   ├── validate-extraction.ts
│   ├── validate-adapter.ts
│   ├── qualify-extraction.ts
│   ├── verify-build-baseline.ts
│   ├── preflight.ts
│   ├── crawl-site.ts               # NEW
│   └── lib/                        # vendored unchanged
├── adapters/                       # 24 adapters vendored + any new ones
│   └── TEMPLATE.md                 # generated from Zod schema
├── schemas/                        # centralized Zod schemas
│   ├── adapter.ts
│   ├── state.ts
│   ├── crawl.ts
│   ├── analysis.ts
│   └── site.ts
└── knowledge/                      # shipped learning material
    ├── lessons.md                  # 68 lessons ported from .ai/lessons.md
    ├── phase-pitfalls/             # per-phase gotchas
    │   ├── discover.md
    │   ├── analyze.md
    │   ├── build.md
    │   └── visual.md
    └── adapter-notes/              # platform-specific lessons
```

### Hard dependencies

Declared in `plugin.json`:

- `superpowers` — required for `dispatching-parallel-agents`, `writing-plans`, `verification-before-completion`, `systematic-debugging`. Hard-fails at session start if missing.

### Soft dependencies

Documented in README, invoked if present, skipped with a one-line warning if absent:

- `vercel-plugin:react-best-practices` — `page-builder` auto-invokes after TSX generation
- `vercel-plugin:nextjs` — `page-builder` invokes at phase 5 start for App Router guidance
- `next-best-practices` — companion to the Vercel skill, covers slightly different ground

Hard gates (build passes, visual diff under threshold) do not depend on soft deps. Soft deps only improve component quality; a migration can ship without them.

### Scripts and adapters policy

All scripts in `scripts/` and all adapters in `adapters/` are **vendored verbatim** from `nextjs-migration-agent`. They are not modified in the plugin. If the old repo improves a script, the improvement is manually ported to the plugin. The plugin is the source of truth going forward.

## 4. State model

All migration state lives in the **user's project directory** at `.migration/`. It never lives in the plugin install location. The state survives Claude Code session resets, context compaction, and full reboots.

Each initialized target has `.migration/SESSION_LOG.md`. It is a human-readable debug ledger for session reconstruction and plugin improvement notes, not a machine-readable phase input. No session log is written at the target root; keeping the ledger inside `.migration/` prevents conflicts with project scaffolding tools.

```
<user-project-dir>/.migration/
├── SESSION_LOG.md                 # human debugging ledger
├── SITE.md                        # global config, YAML frontmatter
├── library/                       # shared, evolves across runs
│   ├── components.json            # component registry — live source of truth
│   ├── layouts.json               # shared shell patterns
│   ├── props.json                 # generated TS prop interfaces
│   ├── routes.json                # source-URL → Next.js-route mapping
│   └── HISTORY.md                 # changelog of library changes
├── pages/                         # shared, one dir per migrated page
│   └── [slug]/
│       ├── spec/                  # extracted styles/images/animations
│       ├── status.json            # which run brought this page in, which runs polished it
│       ├── component-usage.json   # which library components this page uses
│       ├── baseline.png           # screenshot at last verified state — regression reference
│       └── diffs/                 # visual diffs from latest polish run
├── runs/                          # discrete units of work
│   ├── 001-initial/
│   │   ├── RUN.md                 # scope, user-approved
│   │   ├── ROADMAP.md             # output of phase 3 — the run's plan
│   │   ├── phase-1-discover/
│   │   │   ├── PLAN.md
│   │   │   ├── EXECUTION.md
│   │   │   └── VERIFICATION.md
│   │   ├── phase-2-analyze/
│   │   ├── phase-3-plan/
│   │   ├── phase-4-extract/
│   │   └── phase-5-build/
│   ├── 002-polish-landing/
│   │   ├── RUN.md
│   │   ├── phase-6-visual/
│   │   ├── phase-7-animate/
│   │   └── phase-8-perf/
│   └── 003-add-blog/
│       └── …                      # delta run, phases 1-5 again
├── auto-repairs.log               # runtime auto-repair events
└── REPORT.md                      # cumulative migration report
```

### State format rules

- **Markdown for humans, JSON for phases.** `SITE.md`, `RUN.md`, `PLAN.md`, `EXECUTION.md`, `VERIFICATION.md`, `HISTORY.md`, `REPORT.md` — markdown because humans read them. `crawl.json`, `layouts.json`, `components.json`, `props.json`, `routes.json`, `status.json`, `component-usage.json` — JSON because agents query them.
- **All JSON files are Zod-validated at read time.** No silent corruption. Invalid JSON triggers `state-repairer` (§ 7).
- **Status is computed, not stored.** `/migrate:continue` reconstructs progress by scanning phase dirs for presence/absence/content of `VERIFICATION.md`. No separate status field to desync.
- **Every write is atomic-commit eligible.** Phase executor commits after each unit of work (page extracted, page built, section verified). `git log` is a secondary source of truth.
- **`.migration/` is gitignored by default,** but users can check it in if they want shared migration state.

### `SITE.md` schema

```yaml
---
# REQUIRED
sourceUrl: https://example.com
target: ./                          # target directory (relative to .migration/ parent)

# MODES & GOALS
mode: attended                      # attended | unattended
goal: pixel-perfect                 # wireframe | pixel-perfect
inputMode: url-only                 # url-only | url-plus-repo

# OPTIONAL
sourceRepo: ~/dev/example-site      # if inputMode == url-plus-repo
initialPageSelection: ["all"]        # all, or selected source paths/URLs from /migrate:new
maxParallelPages: 4
maxParallelSections: 4

# RESERVED FOR FUTURE
# targetUrl: https://new.example.com
# goals additional to pixel-perfect: redesign-port, content-only
# inputMode additional: content-migration, cms-to-cms
---

# example.com migration

<!-- Human-readable description, populated by wizard -->
```

Schemas are Zod-validated. Reserved fields in the schema are commented out and documented but not active in v1 — adding them in v2 is non-breaking.

## 5. The 8 phases

| # | Phase | Main agent(s) | Output artifacts | Verification gate |
|---|-------|--------------|------------------|-------------------|
| 1 | Discover | site-crawler | `discovery/crawl.json`, `discovery/probe.json` | User confirms page list; adapters matched for all pages (or explicit `ABORT_NO_ADAPTER` per page) |
| 2 | Analyze | layout-extractor → component-deduper → prop-classifier → route-mapper | `library/*.json` | Every page in crawl has entry in `routes.json`; every section across pages belongs to a cluster or is marked unique |
| 3 | Plan | migration-planner → plan-checker | `ROADMAP.md` at the active run's top level | User approves roadmap; every page + component has a build order |
| 4 | Extract | page-extractor (×N parallel, ≤ `maxParallelPages`) | `pages/[slug]/spec/` | `validate-extraction` passes; `qualify-extraction` passes |
| 5 | Build | page-builder (×N parallel) | Next.js files under `<target>/src/` | `next build` passes; `verify-build-baseline` passes at 1440px |
| 6 | Visual (polish) | page-verifier (×sections parallel, 4 viewport rounds) | `pages/[slug]/diffs/` | All pages in scope <1% diff at all 4 viewports |
| 7 | Animate (polish) | page-animator | Animation specs + code | Reference animations match |
| 8 | Perf (polish) | page-optimizer | Lighthouse outputs, bundle stats | 90+ PageSpeed |

### Phase ordering and parallelism

- Phases 1 → 2 → 3 are strictly serial
- Phase 4 is parallel-by-page, capped at `maxParallelPages`
- Phase 5 is parallel-by-page, same cap. Default is a barrier between 4 and 5 for v1 simplicity (Extract all, then Build all). Per-page pipelining is a v2 optimization.
- Phase 6 is **per-page opt-in** via `/migrate:polish`. It is not auto-invoked in `wireframe` goal. In `pixel-perfect` goal, it auto-runs for all pages after phase 5 completes. Phases 7 / 8 are follow-up polish phases and are not part of the current `/migrate:polish` rollout.

### Goal presets as sugar over the same machinery

- `goal: wireframe` = stop after phase 5
- `goal: pixel-perfect` = after phase 5, auto-dispatch `/migrate:polish --all` for Phase 6 Visual; Phase 7 Animate and Phase 8 Perf remain follow-up phases

Users can freely mix: start `wireframe`, polish one page, add more pages (delta run), polish some, and so on.

### Phase preconditions

Every phase skill checks its preconditions and fails with a clear remediation command if unmet. Example: `/migrate:extract` run before Plan completes → *"Plan phase must complete first. Run `/migrate:plan` or `/migrate:continue`."*

### Phase 5 v1 component strategy

The Phase 5 default builder emits one TSX file per generated page section plus layout-shell files. This keeps the first build visually local to each extracted page and avoids creating prop APIs before visual parity is proven. The Phase 2 component registry still records reusable opportunities, but prop-based consolidation is deferred to a later polish/refactor pass after the baseline build is stable.

Phase 5 also rewrites the target `src/app/globals.css` from the homepage `spec/00-globals.json` body foundation. The scaffold's default dark-mode media query must not override a source site whose captured body background is light.

## 6. Incremental delta runs

Each run is a scoped unit of work. First run migrates N pages; later runs add pages or polish existing ones. Library and per-page state persist and evolve across runs.

### Run types

| Trigger | Run type | Phases executed |
|---|---|---|
| `/migrate:new` | `initial` | 1-5 (+ Phase 6 Visual if pixel-perfect) |
| `/migrate:add-pages <urls…>` | `extend` | 1-5, but phase 2 runs in delta mode and reuses library |
| `/migrate:polish <slug>` or `--all` | `polish` | Phase 6 Visual for in-scope pages only |

### Delta-mode Analyze

When Phase 2 runs inside a delta run:
1. Seed with existing `library/components.json`
2. For each section in new pages, compute DOM signature
3. **Exact match** → reuse component, no change
4. **Near match (≥90% similarity)** → component-deduper proposes an *extension* to the existing component:
   - Preferred: add a new prop variant with default = existing behavior (non-destructive by construction)
   - Fallback: create a sibling variant file (e.g., `Hero.dark.tsx`) — never mutates baseline
5. **No match** → new component added to registry

### Visual regression gate in delta runs

Before Phase 5 commits any *extended* component code, a dispatched verifier:
1. Reads `component-usage.json` for every page that uses the changed component
2. Runs `verify-visual` against each at the baseline viewport, comparing to `pages/[slug]/baseline.png`
3. If any page regresses → back out the extension, fall back to variant-file approach
4. Re-verify until all existing pages are pixel-identical to their baseline

Polished pages update their `baseline.png` after successful polish. Regression is measured against the baseline, not the source URL. Once a page is polished, library changes cannot un-polish it.

## 7. Adapter Zod schema + auto-repair

### Schema

`schemas/adapter.ts` defines `AdapterSchema` as the single source of truth. It derives:
- TypeScript types (`Adapter = z.infer<typeof AdapterSchema>`)
- Runtime validation at adapter load time
- Generated `adapters/TEMPLATE.md` documentation

Adapter fields: `name`, `type` (`framework` | `cms`), `version`, `detection` (3-layer), `sectionDiscovery`, `styles`, `images`, `animations`, `localSite`, `dynamicElements`, `validation`.

### Loader contract

```typescript
function loadAdapter(path: string):
  | { valid: true; adapter: Adapter }
  | { valid: false; issues: z.ZodIssue[]; rawJson: unknown; path: string };
```

The loader **never throws**. Callers handle both branches.

### Auto-repair flow

Triggered when `valid: false`. Dispatched by whichever phase touches adapters:
1. Dispatch `adapter-repairer` agent with: `issues`, `rawJson`, `path`, and the schema file
2. Agent rewrites the adapter JSON to satisfy the schema
3. Re-validate
4. Max 3 attempts
5. On failure, hard-fail with structured diagnostic printed to user — not a stack trace

### Scope boundaries

**Auto-repair is for format issues only:**
- ✅ Missing required field → agent infers and adds
- ✅ Wrong type → agent coerces or infers correct value
- ✅ Unknown key → agent removes or renames to nearest valid key
- ❌ Semantic problems (selector returns 0 sections) — those are caught by `validate-adapter` 10-site CI gate, not runtime repair

### State file schemas follow the same pattern

`schemas/state.ts`, `schemas/crawl.ts`, `schemas/analysis.ts` define Zod schemas for all JSON state files. Invalid state files dispatch `state-repairer` with the same 3-attempt flow.

### Custom adapters

Users who write site-specific adapters place them at:
- `<user-project>/.migration-adapters/` (per-project)
- `~/.migration-adapters/` (user-global)

The loader walks the plugin's `adapters/` dir, then user paths. PRs to the plugin repo are the path for adapters that should become shared.

## 8. Knowledge & learning loop

### Surface 1: shipped knowledge (loaded at session start)

`knowledge/lessons.md` (ported from `.ai/lessons.md`) and `knowledge/phase-pitfalls/*.md` are loaded by `hooks/session-start.js`. Phase-pitfall files are loaded **lazily** — only the file matching the user's current phase is injected, keeping context budget manageable as the knowledge base grows.

### Surface 2: per-migration report

`.migration/REPORT.md` is appended throughout the migration. Sections per phase: audit trail, adapter feedback, actionable items, agent stats. Lives in user's repo alongside their code. Plain markdown.

### Surface 3: auto-repair log

`.migration/auto-repairs.log` records every adapter and state file auto-repair event with schema issue, rawJson snapshot, and the repair applied. Purely for user's own debugging. No automatic submission anywhere.

### Adapter validation CI

`validate-adapter.ts` stays verbatim from the old repo. It runs on every adapter PR to the plugin repo as CI. Users running the plugin do not trigger 10-site validation; they just consume the adapters. Maintainer-side only.

### Knowledge flow directionality

Plugin → user: lessons, adapters, schemas. Refreshed on `claude plugin update`.
User → plugin: GitHub issues for feedback. No automated telemetry.

## 9. Commands

All commands are slash commands invoked inside Claude Code.

| Command | Purpose |
|---|---|
| `/migrate:new <url> [--source-repo <path>]` | Wizard intake, scaffolds `.migration/`, creates run 001 |
| `/migrate:continue` | Auto-resume to first incomplete phase. **Daily driver.** |
| `/migrate:discover` | Explicitly run phase 1 |
| `/migrate:analyze` | Explicitly run phase 2 |
| `/migrate:plan` | Explicitly run phase 3 |
| `/migrate:extract` | Explicitly run phase 4 |
| `/migrate:build` | Explicitly run phase 5 |
| `/migrate:polish <slug> \| --all` | Run Phase 6 Visual for a specific page or every page; animation/performance remain pending |
| `/migrate:add-pages <url1> <url2> …` | Create a delta run — discover, analyze, plan, build new pages reusing the library |
| `/migrate:verify [phase]` | Re-run verification gate for current phase (or specified one) |
| `/migrate:status` | Print state: phases done, pages progressed, blockers |
| `/migrate:config <key> <value>` | Flip attended/unattended, set parallelism knobs |
| `/migrate:library` | Print current component registry: what exists, prop schemas, usage counts |
| `/migrate:runs` | List all runs with scope + status |
| `/migrate:ship` | Generate final cumulative report, optional deploy hook |

### Wizard (`/migrate:new`)

Five skippable questions, all with sensible defaults:

```
/migrate:new https://example.com
  ?  Use current dir or ./example-com/? [enter for subfolder if CWD non-empty]
  ?  Do you have the source code repo? Path (optional): [enter to skip]
  ?  Pages to migrate — all discovered pages, or comma-separated URLs/paths? [all]
  ?  Goal — wireframe (fast ~80%) or pixel-perfect (slow, production)? [pixel-perfect]
  ?  Run in attended or unattended mode? [attended]
```

If the page selection is not `all`, `/migrate:new` stores it in `SITE.md` as `initialPageSelection`. Phase 1 normalizes those entries against the source URL and filters `crawl.json` before probing. In attended mode, the Phase 1 page-list confirmation still displays the resulting crawl list as the final confirmation/refinement gate.

### Behavior of `/migrate:continue`

1. Parse the active run's `ROADMAP.md` (or the in-progress run)
2. For each phase in order: does `VERIFICATION.md` exist and pass?
3. Find first failing/missing verification → resume point
4. Dispatch that phase's main skill with the run dir as context
5. If phase is mid-execution (has partial `EXECUTION.md`), hand off to `phase-executor`
6. In `unattended` mode, after a phase completes, immediately re-invoke `/migrate:continue`. Pattern uses `superpowers:dispatching-parallel-agents` internally when phases fan out.

## 10. Agents

### New agents

| Agent | Phase | Role |
|---|---|---|
| `site-crawler` | 1 | Crawls source URL, respects robots.txt, builds URL graph, outputs `crawl.json` |
| `layout-extractor` | 2 | Clusters header/footer/nav across pages via DOM structural signature |
| `component-deduper` | 2 | Hybrid clustering — algorithmic first-pass, LLM refinement for ambiguous clusters |
| `prop-classifier` | 2 | Diffs content across cluster members, generates prop schemas and TS interfaces |
| `route-mapper` | 2 | Builds source-URL → Next.js-route table, rewrites link references |
| `migration-planner` | 3 | Synthesizes analysis into ordered roadmap, asks clarifying questions in attended mode |
| `plan-checker` | 3 | Goal-backward review of roadmap before execution |
| `adapter-repairer` | any | Auto-repairs Zod-invalid adapters (max 3 attempts) |
| `state-repairer` | any | Auto-repairs Zod-invalid state JSON files |

### Agents adapted from existing patterns

| Agent | Phase | Source |
|---|---|---|
| `page-extractor` | 4 | Wraps `extract-styles` + `extract-images` + `extract-animations` scripts |
| `page-builder` | 5 | Adapted from current `build-page-agent.md` template |
| `page-verifier` | 6 | Adapted from current `visual-mcp-agent.md`, dispatched per section |
| `page-animator` | 7 | Adapted from current `animate-page` skill |
| `page-optimizer` | 8 | Adapted from current `optimize-page-performance` skill |

### Generic agents

| Agent | Role |
|---|---|
| `phase-executor` | One per phase. Takes phase dir as input, reads `PLAN.md`, executes tasks, writes `EXECUTION.md` and `VERIFICATION.md`. No migration-specific logic. |
| `phase-verifier` | Goal-backward verifier. Reads phase goal from the roadmap, checks whether the phase dir's output artifacts satisfy the goal. |

### Delegated to other plugins

- `superpowers:dispatching-parallel-agents` — all 2+ parallel dispatches
- `superpowers:verification-before-completion` — pre-completion gate
- `superpowers:writing-plans` — used by `migration-planner` internally
- `superpowers:systematic-debugging` — when a gate fails mid-phase

## 11. Hybrid analysis approach

Phase 2 uses a hybrid clustering approach to balance determinism with semantic flexibility:

1. **Algorithmic first-pass.** Compare DOM trees across extracted specs using structural similarity (tree edit distance + shingle hashing on DOM paths). Cluster sections with similarity above a conservative threshold (high-confidence matches).
2. **LLM refinement.** For each cluster, `component-deduper` verifies and proposes prop interfaces. For unclustered sections, it proposes soft-matches across clusters.
3. **Merge rules.** Deterministic clusters auto-merge. LLM-proposed merges are surfaced for user confirmation in attended mode, auto-accepted in unattended mode.
4. **Cost bound.** The LLM only sees cluster summaries (a few kilobytes per cluster), never full specs.

Clusters carry both an algorithmic signature and an LLM rationale. Auditable, re-runnable.

## 12. Parallelism and long-running execution

### v1 execution model

- Parallel subagents within a phase (dispatched via `superpowers:dispatching-parallel-agents`)
- Checkpoint state to `.migration/` after every atomic unit of work (page extracted, page built, section verified)
- `/migrate:continue` resumes from the first incomplete unit after any crash or context reset
- In `mode: unattended`, phases auto-chain via `/loop` or `CronCreate` — the plugin self-dispatches `/migrate:continue` until no work remains

### Parallelism knobs

In `SITE.md` frontmatter:
- `maxParallelPages` (default 4) — respects Playwright context count and CPU
- `maxParallelSections` (default 4) — per-page parallelism for polish phases

### v1 execution is "kind of around" for attended mode

`attended` mode: user must be available to hit `/migrate:continue` after clarifying-question pauses.
`unattended` mode: runs hands-off, auto-continues. Suitable for overnight runs on large sites.

## 13. v2 roadmap and anti-features

### v2 additions (rough priority)

1. `mode: url-plus-repo` enhancements — deeper source-code analysis, extract actual component names from source code
2. `goal: redesign-port` — structural migration without pixel-perfect constraint
3. Richer route-mapper — redirects, canonical URLs, dynamic routes
4. Per-page resumability at finer granularity (resume mid-page, not just mid-phase)
5. `mode: content-migration` — populate Next.js from CMS
6. `mode: cms-to-cms` — migrate content between CMSs
7. Per-page pipelining between phases 4 and 5 (remove the barrier)
8. Explicit autonomous scheduler (daemon process) for truly background migrations

### Anti-features (will not ship)

- Automatic design "improvements" during migration — scope creep disaster
- "AI suggests redesign" — not what this tool is for
- Selling migration data as a training corpus — privacy failure
- Arbitrary frameworks via LLM-generated adapters — adapters need human review, always

## 14. Reuse from the old repo

| From old repo | Into plugin | Modification |
|---|---|---|
| `scripts/*` (19 files) | `scripts/` | Verbatim, no changes |
| `scripts/lib/*` (13 files) | `scripts/lib/` | Verbatim |
| `.ai/adapters/*` (24 files) | `adapters/` | Verbatim; schema tightened to Zod-validated |
| `.ai/adapters/TEMPLATE.md` | `adapters/TEMPLATE.md` | Regenerated from Zod schema |
| `.ai/lessons.md` | `knowledge/lessons.md` | Verbatim |
| `.ai/skills/orchestrate-page-migration/templates/*` | `agents/page-builder.md` etc. | Adapted — multi-page awareness, registry-aware generation |
| `.ai/skills/orchestrate-page-fix/templates/*` | `agents/page-verifier.md` | Adapted — per-section, baseline-aware for delta runs |
| `.ai/skills/animate-page/*` | `agents/page-animator.md` | Adapted |
| `.ai/skills/optimize-page-performance/*` | `agents/page-optimizer.md` | Adapted |
| `.ai/templates/migration-report.md` | Template embedded in plugin, written to `.migration/REPORT.md` | Adapted — cumulative across runs |
| Behavioral rules from AGENTS.md/CLAUDE.md | Split between plugin README (maintainer-facing) and agent prompts (runtime enforcement) | Rewritten for plugin context |

## 15. Open questions to resolve during implementation planning

None identified during brainstorming. Any unknowns found during implementation are fair game for further discussion.

## 16. Success criteria

- A user can run `/migrate:new https://example.com` in an empty directory, answer 3 wizard questions, and end up with a running Next.js app that matches the source site at ≥80% quality (`wireframe`) or <1% pixel diff (`pixel-perfect`).
- Migration state survives context resets; `/migrate:continue` is sufficient to complete any interrupted migration.
- Delta runs (`/migrate:add-pages`) reuse the component library and never visually regress existing polished pages.
- The plugin installs cleanly from a marketplace, hard-fails with a clear message if `superpowers` is missing, and warns (but works) if soft deps are missing.
- All scripts and adapters from the old repo work unchanged in the plugin, invoked by new agent layers.
