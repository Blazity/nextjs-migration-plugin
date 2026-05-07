---
name: migrate-new
description: Wizard intake for a new migration. Asks five questions with sensible defaults, then creates .migration/.
---

# /migrate:new

You are starting a new Next.js migration. The user has provided a source URL as the first positional argument and optionally a `--source-repo <path>` flag.

## Step 1 — Ask the five wizard questions

All five are skippable with Enter (accept default).

1. **Target directory.** Check if the current working directory is empty. If non-empty, ask: "Use current dir or `./[slugified-domain]/`?" Default: subfolder if CWD is non-empty, current dir if empty.

2. **Source code access** (skip if `--source-repo` was already passed). Ask: "Do you have the source code repo? Path (optional):" Default: skip, use `inputMode: url-only`. If provided, use `inputMode: url-plus-repo`.

3. **Pages to migrate.** Ask: "Pages to migrate — `all` discovered pages, or comma-separated URLs/paths? [all]" Default: `all`. If the user gives paths or URLs, preserve them as `${INITIAL_PAGE_SELECTION}` exactly as a comma-separated list. The Phase 1 discover pass normalizes paths against `${URL}` and filters the crawl before probing.

4. **Goal.** Ask: "Goal — wireframe (fast ~80%) or pixel-perfect (slow, production)? [pixel-perfect]" Default: `pixel-perfect`.

5. **Mode.** Ask: "Run in attended or unattended mode? [attended]" Default: `attended`.

## Step 2 — Ensure the target scaffold exists before migration state

Before invoking the entry script, check `${TARGET_DIR}` for `package.json` and `src/app/layout.tsx`.

If either is missing and the target directory is empty, scaffold before invoking the entry script, before `.migration/` exists. This ordering avoids `create-next-app` conflicts with `.migration/SESSION_LOG.md` and other migration state.

If either is missing and the target directory is not empty, stop before creating `.migration/` and print:

> Target lacks a Next.js App Router scaffold. Create the scaffold first in `[TARGET_DIR]`, then re-run `/migrate:new`.

Do not create `.migration/` before the scaffold exists.

## Step 3 — Invoke the entry script

Run the Node entry point with collected answers:

```bash
tsx ${PLUGIN_DIR}/lib/new-migration.ts \
  --url "${URL}" \
  --target "${TARGET_DIR}" \
  --mode "${MODE}" \
  --goal "${GOAL}" \
  --input-mode "${INPUT_MODE}" \
  --initial-page-selection "${INITIAL_PAGE_SELECTION}" \
  ${SOURCE_REPO:+--source-repo "${SOURCE_REPO}"}
```

If `${PLUGIN_DIR}` is not set by the harness, resolve it from the plugin install path.

## Step 4 — Report success

On success, print:

> Migration initialized at `[TARGET_DIR]/.migration/`. Run `/migrate:continue` to begin, or `/migrate:discover` to run the first phase explicitly.

If the entry script fails (e.g., `.migration/` already exists), surface the error message verbatim and stop.

## Step 5 — Continue unattended runs

If `${MODE}` is `unattended`, immediately invoke `/migrate:continue` from `${TARGET_DIR}` after initialization succeeds.

If `${MODE}` is `attended`, do not automatically invoke another phase. That's the user's call.
