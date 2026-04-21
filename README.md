# nextjs-migration-plugin

Claude Code plugin for pixel-perfect, multi-page Next.js migrations.

Point it at a URL, answer a few wizard questions, get a production-ready Next.js site with shared layouts, a deduped component library, cross-page routing, and <1% visual diff.

## Status

**Pre-release.** Foundation only — commands `migrate:new`, `migrate:status`, `migrate:config` work. Phases are not yet implemented (see `docs/superpowers/plans/` for the implementation roadmap).

## Prerequisites

- Claude Code CLI installed
- `superpowers` plugin installed (hard dependency)
- Node.js ≥22 and pnpm on your machine (scripts shell out to `tsx`)
- Playwright MCP configured (needed once phases land — not required for this release)

## Install

```bash
claude plugin install ./path/to/nextjs-migration-plugin
```

or, from a git URL once published:

```bash
claude plugin install github:blazity/nextjs-migration-plugin
```

Session start will fail with a clear message if `superpowers` is missing.

## Usage (foundation)

```bash
cd ~/dev/my-new-site
claude
# in Claude Code:
/migrate:new https://example.com
```

Answer up to four wizard questions (all have defaults). The plugin creates `.migration/` in your current directory with `SITE.md` and a `runs/001-initial/` scaffold.

```
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

See the design spec at `docs/superpowers/specs/2026-04-21-migration-plugin-design.md`.

## License

TBD
