# Architecture

Architecture invariants and key technical decisions for `nextjs-migration-plugin`. Update this when an invariant changes.

## Source Of Truth

The plugin repository is the source of truth for reusable migration machinery: command wrappers, skills, agents, TypeScript orchestration, schemas, adapters, scripts, docs, and runtime knowledge. A user's active migration state is always stored in that user's target project under `.migration/`, never inside the plugin install directory.

Canonical product/design docs live in `docs/specs/`. Implementation plans live in `.ai/plans/`. Runtime lessons loaded by the plugin live in `knowledge/`. Maintainer-facing team memory lives in `.ai/memory/`.

## Phase Model

Migration work is organized into ordered phases. Each phase should have:

- a skill contract in `skills/`;
- deterministic orchestration in `lib/` when useful;
- agent prompts in `agents/` when LLM refinement is part of the phase;
- artifacts in `.migration/`;
- a verification gate;
- pitfalls or lessons under `knowledge/` when behavior is non-obvious.

Phase identifiers and artifact paths must stay synchronized across those surfaces.

## State And Schema Rules

- `.migration/` belongs to the user's target project and is gitignored by default.
- Human-readable state is Markdown.
- Machine-readable state is JSON and must be validated with Zod at read boundaries.
- Loaders should return structured success/failure results where the caller can recover or dispatch repair; do not hide invalid state.
- Status should be derived from phase artifacts where practical instead of duplicated.

## Scripts And Adapters

The design spec treats `scripts/` and `scripts/lib/` as vendored migration tooling. Prefer adapter JSON or adapter-loading changes for platform-specific behavior. Change scripts only when the active task explicitly updates shared extraction/build/verification behavior and includes focused regression coverage.

Adapter schemas live in `schemas/adapter.ts`. Adapter documentation is generated into `adapters/TEMPLATE.md` and must stay aligned with the schema.

## Package Boundaries

- `commands/` owns thin slash-command wrappers only.
- `skills/` owns LLM-facing workflow instructions and user interaction contracts.
- `agents/` owns delegated prompt templates.
- `lib/` owns deterministic orchestration and filesystem/state logic.
- `schemas/` owns validation contracts.
- `scripts/` owns executable migration helpers.
- `adapters/` owns platform/CMS/framework detection and extraction config.
- `knowledge/` owns plugin-shipped runtime lessons.
- `.ai/` owns maintainer-facing AI harness docs and vendored general-purpose skills.

## Tests

Use Vitest for TypeScript library and script-helper behavior. Keep tests focused for narrow changes, and broaden coverage when a change touches phase contracts, shared loaders, schemas, route/slug generation, extraction/build orchestration, or command-visible behavior.

## Standalone Specs

Files under `docs/specs/` are standalone canonical product documentation. Do not put task IDs, issue numbers, or "this task" language in specs. If rationale matters and should outlive a plan, create an ADR under `docs/adrs/`.
