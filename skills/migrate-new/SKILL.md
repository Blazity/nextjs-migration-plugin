---
name: migrate-new
description: Wizard intake for a new migration. Asks four questions with sensible defaults, then creates .migration/.
---

# /migrate:new

You are starting a new Next.js migration. The user has provided a source URL as the first positional argument and optionally a `--source-repo <path>` flag.

## Step 1 — Ask the four wizard questions

All four are skippable with Enter (accept default).

1. **Target directory.** Check if the current working directory is empty. If non-empty, ask: "Use current dir or `./[slugified-domain]/`?" Default: subfolder if CWD is non-empty, current dir if empty.

2. **Source code access** (skip if `--source-repo` was already passed). Ask: "Do you have the source code repo? Path (optional):" Default: skip, use `inputMode: url-only`. If provided, use `inputMode: url-plus-repo`.

3. **Goal.** Ask: "Goal — wireframe (fast ~80%) or pixel-perfect (slow, production)? [pixel-perfect]" Default: `pixel-perfect`.

4. **Mode.** Ask: "Run in attended or unattended mode? [attended]" Default: `attended`.

## Step 2 — Invoke the entry script

Run the Node entry point with collected answers:

```bash
tsx ${PLUGIN_DIR}/lib/new-migration.ts \
  --url "${URL}" \
  --target "${TARGET_DIR}" \
  --mode "${MODE}" \
  --goal "${GOAL}" \
  --input-mode "${INPUT_MODE}" \
  ${SOURCE_REPO:+--source-repo "${SOURCE_REPO}"}
```

If `${PLUGIN_DIR}` is not set by the harness, resolve it from the plugin install path.

## Step 3 — Report success

On success, print:

> Migration initialized at `[TARGET_DIR]/.migration/`. Run `/migrate:continue` to begin, or `/migrate:discover` to run the first phase explicitly.

If the entry script fails (e.g., `.migration/` already exists), surface the error message verbatim and stop.

## Step 4 — Do not proceed to other phases

This skill ONLY bootstraps the migration. Do not automatically invoke `/migrate:discover` or any other phase. That's the user's call.
