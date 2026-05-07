# Migration Run Regressions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent the known Blazity migration failures from repeating in future plugin runs.

**Architecture:** Keep runtime state inside the target `.migration/` directory, make Phase 2 layout shell selection stricter, make Phase 5 consume exact section membership when available, and add hard gates for emitted asset references. Prefer small deterministic helpers and contract tests over patching target output.

**Tech Stack:** TypeScript ESM, Vitest, pnpm, Claude Code plugin skills/agents.

---

## Confirmed Scope

- Fix root `SESSION-LOG.md` creation by moving the canonical log to `.migration/SESSION_LOG.md`.
- Preserve and test the existing uncommitted fixes for layout-shell emission and `<main>{children}</main>`.
- Strengthen layout shell classification so page heroes using `<header>` are not promoted over real navigation.
- Fix image manifest handoff and staged asset path doubling so generated JSX can resolve extracted assets.
- Add a Phase 5 asset-reference gate that fails when emitted `/...asset.ext` references do not exist under `public/`.
- Fix stale skill/spec/knowledge text that encouraged root logs or manual Phase 5 waivers.

## Out Of Scope Unless A Later Loop Proves Otherwise

- Prop-based component dedup in Phase 5. Current spec intentionally defers this to post-baseline polish/refactor.
- Full Phase 6/7/8 implementation. Current pre-release design says these are approved but not fully implemented.

---

## Task 1: Session Log Single Source

**Files:**
- Modify: `lib/session-log.ts`
- Modify: `test/new-migration.test.ts`
- Create: `test/session-log.test.ts`
- Modify: `test/build.test.ts`
- Modify: `docs/specs/2026-04-21-migration-plugin-design.md`
- Modify: `skills/migrate-build/SKILL.md`

**Steps:**
- [x] Write failing tests that `runNewMigration` creates `.migration/SESSION_LOG.md` and does not create root `SESSION-LOG.md`.
- [x] Write failing unit tests for `ensureSessionLog` and `appendSessionLog` targeting `.migration/SESSION_LOG.md`.
- [x] Extend the Phase 5 success test to assert the build event is appended to `.migration/SESSION_LOG.md`.
- [x] Change `sessionLogPath` to `.migration/SESSION_LOG.md`.
- [x] Update spec and skill text to remove root `SESSION-LOG.md`.
- [x] Run `pnpm test test/session-log.test.ts test/new-migration.test.ts test/build.test.ts`.

## Task 2: Layout Shell Root Causes

**Files:**
- Modify: `schemas/layouts.ts`
- Modify: `lib/analyze.ts`
- Modify: `lib/build.ts`
- Modify: `lib/layout-assembler.ts`
- Modify: `agents/layout-extractor.md`
- Modify: `test/analyze.test.ts`
- Modify: `test/build.test.ts`
- Modify: `test/layout-assembler.test.ts`

**Steps:**
- [x] Write/adjust tests proving layout output wraps page children in `<main>`.
- [x] Write a failing analyze test where a 35/38 page hero cluster with root `<header>` is rejected because it misses the home page, while a 38/38 nav cluster containing `<nav>` is accepted.
- [x] Write a failing build test where a layout shell with `memberIds` emits from exact membership even when representative `tagSkeleton` does not equal any section.
- [x] Add optional `memberIds` to layout shell schema and have algorithmic layout extraction populate it.
- [x] Update Phase 5 layout shell emission to resolve `memberIds` first and fall back to the legacy `appearsOn` skeleton walk.
- [x] Update the layout-extractor agent prompt to require home/root coverage and >=90% page coverage, and to allow nav candidates whose skeleton contains `nav`.
- [x] Run `pnpm test test/analyze.test.ts test/build.test.ts test/layout-assembler.test.ts test/layouts-schema.test.ts`.

## Task 3: Asset Pipeline Regression Gates

**Files:**
- Modify: `scripts/extract-images.ts`
- Modify: `lib/extract-runner.ts`
- Modify: `scripts/generate-jsx.ts`
- Modify: `lib/build.ts`
- Create: `test/extract-images-core.test.ts`
- Modify: `test/extract-runner.test.ts`
- Modify: `test/build.test.ts`
- Modify: `knowledge/phase-pitfalls/extract.md`
- Modify: `knowledge/phase-pitfalls/build.md`

**Steps:**
- [x] Write a failing extract-runner test proving default image extraction moves `image-manifest.json` into the page spec and counts images from it.
- [x] Write a failing image-output test proving staged files are written under `public/images/<domain>/<page>/...` without duplicated `domain/page`.
- [x] Write a failing Phase 5 test proving missing emitted asset references fail `verification.json`.
- [x] Update `extract-images.ts` to call `writeImageOutput` with `public/images` as the image root.
- [x] Update `extract-runner` to move `image-manifest.json` into spec output and support it in stats.
- [x] Update `generate-jsx.ts` to read `image-manifest.json` or `images.json`.
- [x] Add an asset-reference checker to Phase 5 and include it in the verification criteria.
- [x] Update build/extract pitfalls to match the fixed contract.
- [x] Run `pnpm test test/extract-runner.test.ts test/build.test.ts test/extract-images-core.test.ts`.

## Task 4: Skill Contract Corrections

**Files:**
- Modify: `skills/migrate-new/SKILL.md`
- Modify: `skills/migrate-continue/SKILL.md`
- Modify: `skills/migrate-build/SKILL.md`
- Modify: `test/migration-skill-contracts.test.ts`

**Steps:**
- [x] Add skill contract tests that unattended `/migrate:new` auto-invokes `/migrate:continue`, root session logs are forbidden, and Phase 5 gates must not be manually waived.
- [x] Update `/migrate:new` so unattended mode auto-continues after initialization.
- [x] Update `/migrate:new` scaffolding guidance so any Next.js scaffold is created before `.migration/`, avoiding create-next-app conflicts.
- [x] Update `/migrate:continue` wording that currently implies Phase 5 accepts failed baseline verification.
- [x] Run `pnpm test test/migration-skill-contracts.test.ts`.

## Task 5: Fresh Build Server For Baseline Verification

**Files:**
- Modify: `lib/build.ts`
- Create: `lib/next-start-runner.ts`
- Modify: `test/build.test.ts`
- Modify: `knowledge/phase-pitfalls/build.md`

**Steps:**
- [x] Write a failing Phase 5 test proving baseline verification runs through a fresh server wrapper and receives that wrapper's local URL.
- [x] Add a default server wrapper that starts `next start` on a free port after `next build`, waits for HTTP readiness, runs `verify-build-baseline`, and tears the server down.
- [x] Use the fresh server wrapper in production Phase 5 unless tests inject a direct verifier.
- [x] Update build pitfalls to document that Phase 5 owns a fresh `next start` lifecycle.
- [x] Run `pnpm test test/build.test.ts`.

## Task 6: Stale Verification Cleanup

**Files:**
- Modify: `lib/phase-state.ts`
- Modify: `test/phase-state.test.ts`

**Steps:**
- [x] Write a failing regression proving a failed re-run removes stale `VERIFICATION.md`.
- [x] Update `writeVerification` to remove stale markdown when `passed: false`.
- [x] Run `pnpm test test/phase-state.test.ts`.

## Task 7: Verification Loop

**Files:**
- Runtime only, no planned source edits unless tests expose more confirmed root causes.

**Steps:**
- [x] Run focused test set from Tasks 1-5.
- [x] Run `pnpm typecheck`.
- [x] Run the Claude Code plugin programmatically in a tmux session against `/Users/blazity/dev/migrate-blazity-site`.
- [x] Re-check `/Users/blazity/dev/migrate-blazity-site/.migration/SESSION_LOG.md` and confirm no new root `SESSION-LOG.md` was created by the plugin run.
- [x] If a known bug repeats, classify it, write a failing regression test, fix root cause, and repeat the loop.
- [x] Run full `pnpm test` and final `pnpm typecheck`.
