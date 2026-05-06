# Product Brief

Stable knowledge about what `nextjs-migration-plugin` is and why it exists. Update this only when the product direction changes.

## What nextjs-migration-plugin Is

`nextjs-migration-plugin` is a Claude Code plugin that migrates public websites into Next.js App Router projects through a phased, resumable agent workflow. It combines deterministic TypeScript runners, vendored extraction scripts, platform adapters, and LLM-facing skills/agents to produce shared layouts, deduplicated components, routes, extracted page specs, and build output.

## Why It Exists

The previous migration tooling was shaped around single-page workflows. This plugin turns migration into an A-to-Z, multi-page system with persistent state, explicit planning, component reuse across pages, delta runs, and verification gates that survive context resets and long-running agent work.

## Who It's For

- Blazity engineers migrating customer or internal websites to Next.js.
- AI agents running migration phases inside Claude Code.
- Maintainers extending adapters, schemas, scripts, skills, and phase orchestration.
- Reviewers who need a file-based audit trail for what a migration did and why.

## Core Architecture

The plugin installs into Claude Code and exposes `/migrate:*` commands backed by project skills. Runtime state is created in the user's target project under `.migration/`; the plugin repository ships the reusable machinery: command wrappers, skills, agent prompts, TypeScript orchestration, Zod schemas, adapters, scripts, and runtime knowledge.

## Out Of Scope For Current V1

- Non-Next.js targets.
- Content migration and CMS-to-CMS migration modes.
- GUI or web dashboard.
- Multi-site parallel migrations.
- Automated telemetry submission to plugin maintainers.
- Goal presets beyond `wireframe` and `pixel-perfect`.
