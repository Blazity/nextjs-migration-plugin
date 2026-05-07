# migrate-help Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a discoverable skill-only help surface with static workflow guidance and a context-aware final paragraph.

**Architecture:** Add the help surface as a skill only. The skill owns the help content, uses existing migration status state for the final recommendation, and is manual-only via `disable-model-invocation: true`.

**Tech Stack:** Claude Code plugin markdown commands, Superpowers-style skill markdown, Vitest filesystem/frontmatter regression tests.

---

### Task 1: Skill Contract

**Files:**
- Create: `test/migrate-help-skill.test.ts`
- Create: `skills/migrate-help/SKILL.md`

**Step 1: Write the failing test** - completed

Add a Vitest test that proves:

- no `commands/migrate-help.md` wrapper exists;
- `skills/migrate-help/SKILL.md` exists;
- the skill includes static workflow guidance and a context-aware final paragraph.

**Step 2: Run test to verify it fails** - completed

Run: `pnpm test test/migrate-help-skill.test.ts`

Expected: FAIL because the skill file does not exist yet.

**Step 3: Add the skill** - completed

Create the skill in `skills/migrate-help/SKILL.md` without adding a legacy command wrapper.

**Step 4: Run test to verify it passes** - completed

Run: `pnpm test test/migrate-help-skill.test.ts`

Expected: PASS.

### Task 2: README Surface

**Files:**
- Modify: `README.md`

**Step 1: Update README** - completed

Mention `/nextjs-migration-plugin:migrate-help` in usage so new users can discover it.

**Step 2: Run affected verification** - completed

Run: `pnpm typecheck`

Expected: PASS.

### Task 3: Final Verification

**Files:**
- Review all touched files.

**Step 1: Run affected tests** - completed

Run: `pnpm test test/migrate-help-skill.test.ts`

Expected: PASS.

**Step 2: Run repository checks** - completed

Run: `pnpm typecheck`

Expected: PASS.

**Step 3: Inspect diff** - completed

Run: `git diff -- skills/migrate-help/SKILL.md test/migrate-help-skill.test.ts README.md .ai/plans/2026-05-05-migrate-help-design.md .ai/plans/2026-05-05-migrate-help.md`

Expected: only planned files changed.
