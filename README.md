# nextjs-migration-plugin

`nextjs-migration-plugin` is a Claude Code plugin for migrating public websites into production-ready Next.js App Router projects. It turns a source URL into a guided, resumable workflow with local migration state, component discovery, review gates, build generation, and verification-oriented follow-up.

## Status

This is a pre-release v1. The current public surface focuses on the guided flow for starting, continuing, checking, and getting help for a migration. Internals for discovery, extraction, build, visual verification, and recovery continue to evolve before a stable 1.0 contract.

## Prerequisites

- Claude Code with plugin support
- Node.js 22 or newer
- `pnpm`
- Playwright-compatible browser dependencies for extraction and visual verification workflows
- A target project directory where the migration can create local `.migration/` state

## Install

Use the Atlas marketplace path for normal installation:

```text
/plugin marketplace add Blazity/atlas
/plugin install nextjs-migration-plugin@blazity
```

For local development or direct testing from a checkout, install the plugin from this repository path:

```bash
claude plugin install /path/to/nextjs-migration-plugin
```

The checked-in `.claude-plugin/marketplace.json` is local development metadata for validating this plugin repository. Atlas is the public catalog entrypoint.

## Quickstart

```bash
cd /path/to/target-nextjs-project
claude
```

Then run the guided commands in Claude Code:

```text
/migrate:help
/migrate:new https://example.com
/migrate:status
/migrate:continue
```

## Guided Workflow

`/migrate:help` explains the current migration state and recommends the next normal command.

`/migrate:new` starts a migration from a source URL, asks the guided intake questions, prepares local state, and drives the first review checkpoint.

`/migrate:status` prints the current approval state, progress, and blockers for the active migration directory.

`/migrate:continue` resumes from the current guided checkpoint, including component inventory review, component batch approval, page layout approval, and follow-up verification work.

## Local State And Telemetry

Migration state is written into the target project under `.migration/`. That directory contains human-readable phase notes, machine-readable artifacts, decisions, approvals, and generated review outputs for the local run.

The plugin does not add telemetry. Migration artifacts stay local unless you explicitly copy, commit, upload, or share them through your own tools.

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
```

This repository uses `pnpm`, Node.js, ESM, TypeScript, and Vitest. Keep release-facing metadata aligned across `package.json`, `plugin.json`, and `.claude-plugin/plugin.json`.

## Credits

Built by Blazity.

See [ACKNOWLEDGMENTS.md](ACKNOWLEDGMENTS.md) for visual parity attribution, including public credit to @jczapski0 for the original visual parity methodology and legacy visual verification/polish tooling adapted into this plugin.

## Contributing And Support

Use GitHub issues for bug reports, installation problems, and support requests. Use pull requests for focused fixes or documentation improvements. Each plugin repository remains authoritative for its own behavior, release notes, and support routing.

## License

MIT. See [LICENSE](LICENSE).
