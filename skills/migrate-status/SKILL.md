---
name: migrate-status
description: Prints a concise status overview of the current migration.
---

# /migrate:status

Read the current migration state and print a short human-readable summary.

## Step 1 — Invoke status script

```bash
tsx ${PLUGIN_DIR}/lib/status.ts --target "${PWD}"
```

Alternatively, since the logic is simple, you may read `.migration/SITE.md` and `.migration/runs/` directly and format output yourself — but prefer the script to avoid drift.

## Step 2 — Format output

If `initialized: false`: print "No migration in this directory. Run `/migrate:new <url>` to start."

If `initialized: true`: print:

```
Migration: [sourceUrl]
Mode: [mode] | Goal: [goal] | Input: [inputMode]
Active run: [activeRun]
Completed phases: [completedPhases.join(", ") or "none yet"]
```

Then suggest the next command based on state — typically `/migrate:continue` unless all phases are done.
