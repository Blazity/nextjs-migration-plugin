# nextjs-migration-plugin

Claude Code plugin for pixel-perfect, multi-page Next.js migrations.

Point it at a URL, answer a few wizard questions, get a production-ready Next.js site with shared layouts, a deduped component library, cross-page routing, and <1% visual diff.

## Status

**Pre-release.** The repository contains the plugin foundation plus phase work through build-oriented workflows. See `.ai/plans/` for executed implementation plans and `docs/specs/` for canonical design docs.

## Prerequisites

- Claude Code CLI installed
- `superpowers` plugin installed (hard dependency)
- Node.js ≥22 and pnpm on your machine (scripts shell out to `tsx`)
- Playwright/browser tooling available for extraction and verification phases.

## Install

```bash
claude plugin install ./path/to/nextjs-migration-plugin
```

or, from a git URL once published:

```bash
claude plugin install github:blazity/nextjs-migration-plugin
```

Session start will fail with a clear message if `superpowers` is missing.

## Usage

```bash
cd ~/dev/my-new-site
claude
# in Claude Code:
/nextjs-migration-plugin:migrate-help
/migrate:new https://example.com
```

Answer up to four wizard questions (all have defaults). The plugin creates `.migration/` in your current directory with `SITE.md` and a `runs/001-initial/` scaffold.

```
/nextjs-migration-plugin:migrate-help   # explain the workflow and recommend the next command
/migrate:status        # print current state
/migrate:config mode unattended   # flip a setting
```

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
```

## Architecture

See the design spec at `docs/specs/2026-04-21-migration-plugin-design.md`.

AI-facing maintainer documentation uses the [`Blazity/ai-harness`](https://github.com/Blazity/ai-harness) scaffold. It lives in `.ai/`; implementation plans are in `.ai/plans/`, research artifacts in `.ai/research/`, and durable project memory in `.ai/memory/`.

## License

TBD
