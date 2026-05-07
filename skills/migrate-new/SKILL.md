---
name: migrate-new
description: Wizard intake for a new migration. Asks three questions with sensible defaults, then reaches the Component Inventory Review.
---

# /migrate:new

You are starting a new Next.js migration. The user has provided a source URL as the first positional argument and optionally a `--source-repo <path>` flag.

## Step 1 — Ask the three wizard questions

All three are skippable with Enter (accept default).

1. **Target directory.** Check if the current working directory is empty. If non-empty, ask: "Use current dir or `./[slugified-domain]/`?" Default: subfolder if CWD is non-empty, current dir if empty.

2. **Source code access** (skip if `--source-repo` was already passed). Ask: "Do you have the source code repo? Path (optional):" Default: skip, use the `url-only` input mode. If provided, use the `url-plus-repo` input mode.

3. **Pages to migrate.** Ask: "Pages to migrate — `all` discovered pages, or comma-separated URLs/paths? [all]" Default: `all`. If the user gives paths or URLs, preserve them as `${INITIAL_PAGE_SELECTION}` exactly as a comma-separated list. The initial crawl/probe pass normalizes paths against `${URL}` and filters the crawl before probing.

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
  --input-mode "${INPUT_MODE}" \
  --initial-page-selection "${INITIAL_PAGE_SELECTION}" \
  ${SOURCE_REPO:+--source-repo "${SOURCE_REPO}"}
```

If `${PLUGIN_DIR}` is not set by the harness, resolve it from the plugin install path.

## Step 4 — Report the Component Inventory Review

On success, parse the JSON outcome printed by the entry script and report:

> Migration initialized at `[TARGET_DIR]/.migration/`. Open the Component Inventory Review at `[reviewHtmlPath]`. When you are ready, describe any name or grouping changes in chat. To approve the inventory, say so in chat.

If the entry script fails (e.g., `.migration/` already exists), surface the error message verbatim and stop.
