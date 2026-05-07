# Memory

Persistent team knowledge about `nextjs-migration-plugin` — the product, the architecture, the integrations, the major efforts in flight, and the lessons we've already learned. Read this when you need durable maintainer context. Runtime migration knowledge shipped to users lives in `knowledge/`.

## Layout

| Path                                 | Contents                                                              | Update cadence                                           |
| ------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------- |
| [`product.md`](product.md)           | Vision, audience, scope, why `nextjs-migration-plugin` exists         | Rarely — only when product itself changes                |
| [`architecture.md`](architecture.md) | System patterns, invariants, hard rules                               | When architecture decisions change                       |
| [`stack.md`](stack.md)               | Runtime, deps, infrastructure, constraints                            | On dependency upgrades or infra changes                  |
| [`lessons.md`](lessons.md)           | Append-only dev-time pitfalls                                         | Append on discovery                                      |
| [`topics/`](topics/)                 | Cross-cutting domain knowledge — auth flow, sync, multi-tenancy, etc. | When a topic stabilizes or changes meaningfully          |
| [`integrations/`](integrations/)     | External systems we depend on                                         | When config or auth changes                              |
| [`initiatives/`](initiatives/)       | One file per major team effort — active and completed                 | When an initiative kicks off, hits a milestone, or wraps |

Vocabulary lives at [`../LANGUAGE.md`](../LANGUAGE.md). Architecture decision rationale lives at `docs/adrs/`. Specs live at `docs/specs/`. Repository-wide agent guidance lives in `AGENTS.md`.

## How an agent should read this

```text
First-time / onboarding
  └─ product.md → architecture.md → stack.md → skim topics/ index → skim initiatives/ active

Starting a feature
  └─ architecture.md (invariants) → topics/ (relevant cross-cutting) → initiatives/ (does this fit something?)
       → docs/specs/<owning>.md  (canonical scope, NOT in memory/)

Debugging a thing that broke
  └─ lessons.md (have we seen this?) → topics/ (cross-cutting flow) → integrations/ (external system?)

Wondering why something is the way it is
  └─ architecture.md (patterns) → docs/adrs/ (decision rationale) → initiatives/ (which effort drove this?)
```

## How to update

- **product.md / architecture.md / stack.md** — directly, in the PR that changes the underlying reality. Docs, not state. Reviewed in PR.
- **lessons.md** — append at the bottom on discovery. Lead with the rule, then `Why:` and `How to apply:`.
- **topics/** — add a new file when a cross-cutting concept stabilizes; update existing files when the flow changes. One topic per file.
- **integrations/** — add a new file when integrating a new external system; update on config/auth changes.
- **initiatives/** — create on kickoff, update on milestones, mark `Status: completed` on wrap. One initiative per file (no shared write surface = no merge conflicts).

## Why this shape (and not something more sophisticated)

Reference systems considered during design:

- **Hermes Agent** — minimalist 2-file (MEMORY.md + USER.md, ~3.6KB total), frozen-snapshot system-prompt injection, FTS5 over session history, designed for solo use.
- **Magic Context** (OpenCode plugin) — sophisticated 4-layer SQLite + vector embeddings + 5 access tools, designed for solo use.

Both are user-local. Neither is committed to a team git repo. SQLite databases don't merge cleanly; user-home memory doesn't share with the team.

This system trades runtime sophistication (no semantic search yet, no auto-injection beyond `@AGENTS.md`) for **team-shareability and version control**. If semantic search becomes useful later, an MCP server that indexes these markdown files keeps them as the source of truth.

## What this is _not_

- Not a substitute for issue tracking or todo lists.
- Specs live at `docs/specs/`, not here.
- Don't treat this as a changelog — git log and PR descriptions cover that.
- Operator runbooks belong in package READMEs.
- Personal journals (Hermes-style `USER.md`) stay in user-home, not in the repo.

This is the shared mental model the team and its agents maintain about `nextjs-migration-plugin`.
