# Storybook Reference Overlay Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the current Storybook 10 fix through a cache-busting plugin release and add durable Storybook reference screenshot overlay support.

**Architecture:** Release metadata moves from `0.1.0` to `0.2.0` so Claude Code installs a new cache entry. Generated Storybook config serves `.migration/references` as static files, generated stories carry per-variant reference metadata, and preview decorators render an opacity-controlled overlay on top of migrated component stories.

**Tech Stack:** TypeScript, Claude Code plugin manifests, Storybook 10 `@storybook/nextjs-vite`, Vitest, pnpm.

---

### Task 1: Release Metadata

**Files:**
- Modify: `package.json`
- Modify: `plugin.json`
- Modify: `.claude-plugin/plugin.json`
- Create: `CHANGELOG.md`
- Test: `test/migration-skill-contracts.test.ts`

- [x] Add or update release metadata tests so package/plugin manifests report `0.2.0` and `CHANGELOG.md` mentions the Storybook 10 cache-busting release plus reference overlay.
- [x] Run `pnpm exec vitest run test/migration-skill-contracts.test.ts` and verify the new expectations fail before implementation.
- [x] Update the three manifest versions to `0.2.0`.
- [x] Add `CHANGELOG.md` with a `0.2.0` entry.
- [x] Re-run `pnpm exec vitest run test/migration-skill-contracts.test.ts` and verify it passes.

### Task 2: Storybook Reference Overlay

**Files:**
- Modify: `lib/storybook-scaffold.ts`
- Modify: `lib/component-tsx-emitter.ts`
- Modify: `lib/run-component-batch.ts`
- Test: `test/storybook-scaffold.test.ts`
- Test: `test/implement-component.test.ts`
- Test: `test/run-component-batch.test.ts`

- [x] Add failing tests proving plugin-owned `.storybook/main.ts` serves `.migration/references`, `.storybook/preview.ts` exposes `refOpacity` and renders a reference overlay, generated stories include `refSectionId` parameters, and component batch reports preserve reference paths.
- [x] Run `pnpm exec vitest run test/storybook-scaffold.test.ts test/implement-component.test.ts test/run-component-batch.test.ts` and verify the new expectations fail before implementation.
- [x] Update Storybook scaffold templates to include `staticDirs: [{ from: "../.migration/references", to: "/migration-references" }]` and a preview decorator with opacity-controlled reference image overlay.
- [x] Update generated stories to attach `parameters.reference = { sectionInstanceId }`.
- [x] Update component batch reporting only if needed so review links and report data still expose reference and diff artifacts.
- [x] Re-run the focused Storybook/component tests and verify they pass.

### Task 3: Release Verification And Publication

**Files:**
- All changed files from Tasks 1 and 2.

- [x] Run `pnpm typecheck`.
- [x] Run focused visual/Storybook tests: `pnpm exec vitest run test/storybook-scaffold.test.ts test/storybook-server.test.ts test/verify-component.test.ts test/run-component-batch.test.ts test/implement-component.test.ts test/migration-skill-contracts.test.ts`.
- [x] Run full `pnpm test`.
- [x] Run `git diff --check`.
- [x] Run `claude plugin validate .`.
- [x] Verify `git config user.name` and `git config user.email` are JJ's private GitHub identity.
- [x] Commit with `chore(release): ship storybook overlay release`.
- [ ] Push the branch.
- [ ] Update the installed local Claude plugin with `/plugin marketplace update blazity` / `/plugin update nextjs-migration-plugin@blazity` or the CLI equivalent, then verify the cache points at version `0.2.0`.
