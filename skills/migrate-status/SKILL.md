---
name: migrate-status
description: Prints a concise status overview of the current migration.
---

# /migrate:status

Read the current migration state and print a short human-readable approval-state summary.

## Step 1 — Invoke status script

```bash
tsx ${PLUGIN_DIR}/lib/status.ts --target "${PWD}"
```

Use the script output as the source of truth. Do not infer progress from legacy phase directories.

## Step 2 — Format output

If `initialized: false`: print "No migration in this directory. Run `/migrate:new <url>` to start."

If `initialized: true`: print:

```
Migration: [sourceUrl]
Input: [inputMode]
Inventory: [approvals.inventory]
Draft inventory: revision [draftInventory.revision], hash [draftInventory.hash], blocking names [draftInventory.blockingNames.length]
Components: [approved count] approved, [pending count] pending, [stale count] stale
Pages: [approved count] approved, [stale count] stale
Browser queue concurrency: [queueConcurrency]
```

Then suggest `/migrate:continue` unless inventory, components, or pages have stale approvals. For stale approvals, tell the user which approval bucket needs review before continuing.
