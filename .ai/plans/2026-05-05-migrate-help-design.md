# migrate-help Skill Design

**Goal:** Add a skill-only help surface that teaches users what the migration plugin does and how to move through the workflow.

## Approved Behavior

The help skill prints mostly static onboarding guidance:

- what the plugin does;
- the normal workflow, starting with `/migrate:new <url>` and continuing with `/migrate:continue`;
- the explicit phase commands available for users who want manual control;
- utility commands such as `/migrate:status`, `/migrate:config`, and `/migrate:verify`;
- the difference between `wireframe` and `pixel-perfect` goals at a high level.

The final paragraph is context-aware. It may inspect the current directory's `.migration/` state and recommend the next command:

- if no migration exists, tell the user to start with `/migrate:new <url>`;
- if a migration exists, summarize the active run and completed phases, then suggest `/migrate:continue` or `/migrate:status`.

## Chosen Approach

Use a skill-only help entry:

- `skills/migrate-help/SKILL.md` contains the help output contract and the context-aware status step.
- It uses `disable-model-invocation: true` so the help workflow is manual-only and not automatically loaded by Claude.

Claude Code now treats commands as the legacy flat-markdown skill form and recommends `skills/` for new plugin work. Existing `/migrate:*` command wrappers can be migrated later as one coordinated namespace cleanup; this change avoids adding a new wrapper. Until the namespace is refactored, users invoke the plugin skill directly as `/nextjs-migration-plugin:migrate-help`.
