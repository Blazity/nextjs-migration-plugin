# Topics

Cross-cutting domain knowledge that does not belong to a single file or phase. Repository-wide rules live in `AGENTS.md`. Architectural decisions live in `docs/adrs/`. Specs live in `docs/specs/`. Topics here explain how concepts flow across commands, skills, agents, library code, schemas, scripts, adapters, and runtime knowledge.

## Format

One file per topic. Filename `kebab-case.md`. Each file should answer four questions:

1. **What is it?** — one paragraph; the concept and its boundaries.
2. **How does it work?** — the actual flow, with cross-refs to packages and files.
3. **What guarantees / invariants?** — what must always be true.
4. **Cross-refs.** — pointers to specs, ADRs, code, and other topics.

Keep each file under ~150 lines. If it grows beyond that, split it.

## Index

No topic files yet. Likely future candidates are `phase-model.md`, `migration-state.md`, `adapter-system.md`, and `verification-gates.md`. Add them when the concept needs more than the root `AGENTS.md`, memory files, or owning spec can reasonably carry.

## When to add a topic

When you find yourself explaining a cross-cutting concept twice — to a teammate, to an AI agent, in a PR description — that's the signal. Write it down here once and link from the next conversation.
