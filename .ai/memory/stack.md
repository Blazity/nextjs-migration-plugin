# Stack

Runtime, dependencies, and infrastructure for `nextjs-migration-plugin`. Update when these change.

## Runtime And Tooling

- Node.js `>=22`.
- `pnpm` is the package manager; `pnpm-lock.yaml` is committed.
- TypeScript with ESM (`"type": "module"`).
- `tsx` runs TypeScript scripts from command-line workflows.

## Project Runtime

- Claude Code plugin manifest: `plugin.json`.
- Plugin hook: `hooks/session-start.js`.
- Slash-command wrappers: `commands/`.
- Runtime skills: `skills/`.
- Agent templates: `agents/`.

## Dependencies

- `zod` validates adapters and migration state.
- `gray-matter` parses Markdown files with YAML frontmatter.
- `@playwright/test` supports browser-driven extraction and verification scripts.
- `get-port` supports dev-server/test orchestration.

## Testing

- Unit/regression tests: `pnpm test`.
- Typecheck: `pnpm typecheck`.
- Test runner: Vitest.
- There is no configured linter or formatter script today.

## Frontend

This repository does not contain a frontend app. It generates or modifies Next.js target projects during migrations, but those targets live outside this plugin repository.

## Infrastructure

No shared database, cache, queue, Docker service, or hosted infrastructure is part of this repository. Runtime migrations use local filesystem state in the user's target project.

## Constraints Worth Knowing

- Use `pnpm`, not `bun`, for this repo.
- Do not commit `.migration/`, logs, coverage, or local Claude settings.
- Do not introduce lint/format tooling unless the task explicitly includes that baseline.
- Keep vendor policy in mind before editing `scripts/` or `scripts/lib/`.

## Repository Services

- Issue tracker: GitHub when the repository is published.
- CI: not configured in this checkout.
- Docs deploy: none; docs are committed Markdown.
