# nextjs-migration-plugin

This file is the canonical prose-rules surface for AI agents working in this repository. Codex, Cursor, Windsurf, and VS Code Copilot read it natively; Claude Code reads it through the `@AGENTS.md` shim in `CLAUDE.md`.

## Vision

`nextjs-migration-plugin` is a Claude Code plugin for migrating public websites into production-ready Next.js App Router projects. It turns a source URL, optional source repository, and migration goal into a phased, resumable workflow with persistent `.migration/` state, shared component discovery, build generation, and verification gates.

## Direction

The current product direction is a pre-release v1 focused on phases 1-5: discover, analyze, plan, extract, and build. Polish phases for visual parity, animation, performance, add-pages, library inspection, runs, and ship workflows are part of the approved design but are not all present in the current repository.

## Repository Layout

| Path | What it is |
| --- | --- |
| `plugin.json` | Claude Code plugin manifest, hard dependencies, hooks, command/skill/agent roots. |
| `commands/` | Thin slash-command wrappers for `/migrate:*` commands. |
| `skills/` | Project runtime skills, one directory per migration workflow. |
| `agents/` | Agent prompt templates used by migration phases. |
| `lib/` | TypeScript orchestration, loaders, schemas integration, state helpers, and phase runners. |
| `schemas/` | Zod schemas for adapters and migration state artifacts. |
| `scripts/` | Vendored extraction, crawl, validation, build, and visual tooling. Preserve vendor policy. |
| `adapters/` | Framework/CMS adapter JSON plus the generated schema template. |
| `knowledge/` | Shipped runtime knowledge loaded by plugin hooks and phase skills. |
| `docs/` | Canonical product docs: specs and ADRs. |
| `.ai/` | Shared AI harness: memory, plans, research, and vendored superpowers skills. |
| `test/` and `scripts/tests/` | Vitest coverage for core library behavior and script helpers. |

This is a single-package TypeScript repository using `pnpm`, Node.js, ESM, and Vitest. It is not a monorepo.

## Tech Stack

- **Runtime**: Node.js 22 or newer.
- **Package manager**: `pnpm` because `pnpm-lock.yaml` is committed.
- **Language**: TypeScript with ESM (`"type": "module"`).
- **Validation**: Zod for adapter and state schemas.
- **Testing**: Vitest for unit and regression tests; Playwright is available for browser/script workflows.
- **Plugin runtime**: Claude Code plugin manifest with `commands/`, `skills/`, `agents/`, and `hooks/session-start.js`.

## Canonical Planning Docs

- Docs entrypoint: `docs/README.md`
- Live canonical specs: `docs/specs/README.md`
- Architecture decisions and rationale: `docs/adrs/README.md`
- Implementation plans: `.ai/plans/`
- Research artifacts: `.ai/research/`

Read the owning spec under `docs/specs/` before behavior changes. Use `.ai/plans/` for implementation plans. Do not put implementation plans or research under `docs/`.

## Architecture Patterns

**State model**: Runtime migration state belongs in the user's project at `.migration/`, not in the plugin install directory. Markdown files are for human-readable phase state; JSON files are for machine-readable artifacts and must be schema-validated when loaded.

**Phase boundary**: Each migration phase has a skill contract, TypeScript runner where deterministic orchestration is useful, output artifacts, and a verification gate. Keep phase IDs and artifact names synchronized across `skills/`, `lib/`, `agents/`, `schemas/`, and `knowledge/phase-pitfalls/`.

**Scripts and adapters policy**: `scripts/` and `scripts/lib/` are treated as vendored tooling unless a task explicitly changes the plugin's vendor policy. Platform-specific behavior belongs in adapter JSON or adapter loading logic, not ad hoc script edits.

**Knowledge split**: `knowledge/` is shipped plugin runtime knowledge. `.ai/memory/` is maintainer-facing team memory for this repository. Do not collapse one into the other.

**Tests**: Prefer focused Vitest coverage for changed loaders, schemas, runners, and script helpers. Broaden tests when touching shared phase behavior or artifact contracts.

## Commands

```bash
pnpm install              # Install dependencies
pnpm test                 # Run Vitest
pnpm typecheck            # Run TypeScript typecheck
```

There is no formatter or linter script configured today. Do not invent one unless the active task includes lint/format baseline work.

## Working In This Repo

- Branch names use `feat/`, `fix/`, `chore/`, or `refactor/` prefixes.
- Commit messages follow existing style: `type(scope): brief message`.
- Use `pnpm`, not `bun`, because this repository has a `pnpm-lock.yaml`.
- Keep edits scoped to the current migration-plugin task. Avoid unrelated cleanup.
- Before finalizing a change, run the narrow affected tests and `pnpm typecheck`; for broad docs-only changes, run path/reference checks plus typecheck if code paths were not touched.

## AI Agent Infrastructure

The `.ai/` directory holds shared AI-agent-facing artifacts. It is team operating context, not session state.

```text
.ai/
├── LANGUAGE.md
├── plans/
├── research/
├── memory/
│   ├── product.md
│   ├── architecture.md
│   ├── stack.md
│   ├── lessons.md
│   ├── topics/
│   ├── integrations/
│   └── initiatives/
└── skills/
```

Rules for agents working in this repo:

1. Use `.ai/LANGUAGE.md` for naming.
2. Read `.ai/memory/product.md`, `.ai/memory/architecture.md`, and `.ai/memory/stack.md` before non-trivial work.
3. Append to `.ai/memory/lessons.md` when you hit a non-obvious maintainer pitfall.
4. Plans live in `.ai/plans/` and research lives in `.ai/research/`.
5. Skills are auto-discovered by Claude Code, Codex, and Cursor through `.claude/skills`, `.agents/skills`, and `.cursor/skills` symlinks to `../.ai/skills`.

The vendored superpowers in `.ai/skills/` are the canonical copy for this repo. The global Claude Code `superpowers` plugin is disabled in `.claude/settings.json` to avoid duplicate registrations.

## Task Workflow

For behavior or public workflow changes:

1. Check the owning spec under `docs/specs/`.
2. If the intended behavior is missing, ambiguous, or contradictory, stop and ask for the spec delta before implementation.
3. Map the change to affected commands, skills, agents, library files, schemas, scripts, adapters, and knowledge files.
4. Write or update focused tests for changed behavior before implementation when practical.
5. Update README, CLI help, knowledge files, or `.ai/memory/` only when the underlying contract changes.
6. Verify with affected tests and typecheck before reporting done.

Spec-first nudge template:

`Spec-first gate: this behavior is not fully specified in the owning spec under docs/specs yet. Please update that spec or confirm the exact contract change first, then I will implement strictly against that spec delta.`

## Package Boundary Rules

- `lib/` owns deterministic orchestration and filesystem/state interactions.
- `schemas/` owns validation contracts and inferred TypeScript types.
- `skills/` owns LLM-facing workflow instructions and user interaction rules.
- `commands/` stays thin; put substantive behavior in skills or `lib/`.
- `agents/` owns prompt templates for delegated phase work.
- `knowledge/` owns runtime lessons and pitfalls loaded by hooks/skills.
- `.ai/memory/` owns maintainer-facing durable context for agents working on this repository.

When moving logic across boundaries, preserve clear ownership and avoid circular dependencies.

## Commit And Change Hygiene

- Make focused, task-scoped commits when asked to commit.
- Do not include generated migration output, `.migration/`, local settings, logs, screenshots, or unrelated tooling artifacts.
- Before commit, ensure relevant tests and typecheck pass, or clearly state why a check could not run.
