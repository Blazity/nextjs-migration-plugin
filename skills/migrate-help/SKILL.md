---
name: migrate-help
description: Static help for the migration workflow with a final context-aware next-step recommendation.
disable-model-invocation: true
---

# migrate-help

You are explaining how to use the Next.js migration plugin. This command is read-only. Do not create `.migration/`, mutate config, run a phase, or invoke `/migrate:continue`.

## Step 1 - Print Static Help

Print this help content in a concise, user-facing format:

```text
Next.js Migration Plugin

This tool migrates a public website into a Next.js project through a resumable, file-backed workflow. Migration state lives in `.migration/` inside the target project, so work can resume after context resets.

Normal workflow
1. Start: /migrate:new <url>
2. Continue: /migrate:continue
3. Check progress: /migrate:status
4. Re-run a gate when needed: /migrate:verify [phase]

Most users should use /migrate:continue after the initial setup. It finds the first incomplete phase and routes to the right runner.

Explicit phase commands
- Phase 1 Discover: /migrate:discover crawls the source site and probes platform/adapters.
- Phase 2 Analyze: /migrate:analyze builds route, layout, component, and prop libraries.
- Phase 3 Plan: /migrate:plan creates and verifies the migration roadmap.
- Phase 4 Extract: /migrate:extract captures per-page structure, styles, images, and animations.
- Phase 5 Build: /migrate:build generates the Next.js output and runs build gates.
- Phase 6 Visual Polish: /migrate:polish [slug|--all] improves visual parity with live browser agents.
- Phases 7-8 Animate/Perf: planned follow-up phases for animation parity and 90+ PageSpeed.

Useful controls
- /migrate:config mode attended|unattended controls whether the workflow pauses for user approval.
- /migrate:config goal wireframe|pixel-perfect controls whether the migration stops after Build or continues through polish.
- /migrate:config maxParallelPages <number> tunes per-page concurrency for heavier phases.

Goal presets
- wireframe: complete through Phase 5 Build for a useful structured migration.
- pixel-perfect: continue through Phase 6 Visual after Build; animation and performance polish remain follow-up phases.
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

If the script returns `initialized: true`, append:

> Current context: migrating `[sourceUrl]`, active run `[activeRun]`, completed phases: `[completedPhases or "none yet"]`. Next, run `/migrate:continue` to resume the workflow, or `/migrate:status` for a shorter progress summary.

If the status script fails because local state is invalid, append:

> Local migration state could not be read: `[error message]`. Run `/migrate:status` for the full diagnostic.
