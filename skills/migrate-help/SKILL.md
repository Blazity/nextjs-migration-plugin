---
name: migrate-help
description: Static help for the guided migration workflow with a final context-aware next-step recommendation.
disable-model-invocation: true
---

# migrate-help

You are explaining how to use the Next.js migration plugin. This command is read-only. Do not create `.migration/`, mutate config, run migration work, or invoke `/migrate:continue`.

## Step 1 - Print Static Help

Print this help content in a concise, user-facing format:

```text
Next.js Migration Plugin

Use the guided flow to migrate a public website into a Next.js App Router project with resumable state, component inventory review, component batch approval, and page layout approval.

Commands
- /migrate:new <url> starts a migration and opens Component Inventory Review.
- /migrate:continue resumes the next required approval or implementation step.
- /migrate:status prints current approval, component, page, and queue state.
- /migrate:help shows this help.

Recovery
lower-level scripts and library entry points still exist for maintainers, but they are advanced/recovery tools and are not part of the normal command flow.
```

Keep the help static even if a local migration exists. Only the final paragraph should depend on local state.

## Step 2 - Context-aware final paragraph

Run the status script and use its JSON to append one final paragraph:

```bash
tsx ${PLUGIN_DIR}/lib/status.ts --target "${PWD}"
```

If `${PLUGIN_DIR}` is not set by the harness, resolve it from the plugin install path.

If the script returns `initialized: false`, append:

> No migration in this directory. Start with `/migrate:new <url>`.

If the script returns `initialized: true`, count component and page approval statuses, then append:

> Current context: migrating `[sourceUrl]`; inventory `[approvals.inventory]`; components `[approved] approved, [pending] pending, [stale] stale`; pages `[approved] approved, [stale] stale`; browser queue concurrency `[queueConcurrency]`. Next, run `/migrate:continue` to resume the guided flow, or `/migrate:status` for the full approval summary.

If the status script fails because local state is invalid, append:

> Local migration state could not be read: `[error message]`. Run `/migrate:status` for the full diagnostic.
