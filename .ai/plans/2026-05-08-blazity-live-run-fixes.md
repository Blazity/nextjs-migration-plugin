# Blazity Live-Run Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the guided live-run path so component batches are generated from extracted source evidence, reviewed through working Storybook URLs, protected from destructive overwrites, and verified with behavior-aware, similarity-first diagnostics.

**Architecture:** Keep the guided approval flow as the normal product path and leave legacy phase runners as recovery tools. Add thin deterministic helpers in `lib/` for lifecycle orchestration, design-system foundation generation, interaction classification, and similarity assessment; keep schema changes in `schemas/`; keep browser work behind `BrowserWorkQueue`.

**Tech Stack:** TypeScript ESM, Zod schemas, Vitest, Playwright, PNG/pixelmatch helpers, `pnpm`.

---

## Context

- Owning spec: `docs/specs/2026-05-07-guided-component-first-flow.md`.
- Current strategy commit: `4ea2e90 docs(plugin): capture live-run fix strategy`.
- The normal user workflow is `/migrate:new`, `/migrate:continue`, `/migrate:status`, `/migrate:help`.
- The live-run repair order is fixed by the user:
  1. Non-destructive `implementComponent` / `runComponentBatch`.
  2. Storybook URL/scaffold/server lifecycle.
  3. Guided extraction runner before component batches.
  4. Design-system foundation generator.
  5. Interaction behavior schema/classifier/verifier.
  6. Similarity metric + pixel diff diagnostic changes.
  7. Sticky-header/top-mask visual harness fix.
  8. Skill/docs cleanup.

## File Map

- Modify `lib/implement-component.ts`: add explicit non-destructive write policy and stable collision errors.
- Modify `lib/run-component-batch.ts`: handle implementation errors per component, avoid approval writes, call Storybook lifecycle and guided extraction before verification.
- Modify `schemas/component-batch-report.ts`: add report fields for implementation errors, interaction status, and similarity diagnostics.
- Modify `test/implement-component.test.ts` and `test/run-component-batch.test.ts`: red-green coverage for non-destructive writes and batch error reporting.
- Modify `lib/storybook-url.ts`: emit Storybook iframe URLs for screenshots and review URLs for humans.
- Modify `lib/storybook-scaffold.ts`: scaffold a Next-compatible Storybook config without overwriting existing user Storybook files.
- Create `lib/storybook-server.ts` and `test/storybook-server.test.ts`: start Storybook on an available port, wait for readiness, and always stop it.
- Create `lib/guided-extraction.ts` and `test/guided-extraction.test.ts`: extract specs and generate section TSX before component batches.
- Modify `lib/continue.ts`: default component-batch dispatcher runs guided extraction before `runComponentBatch`.
- Create or extend `lib/design-system-foundation.ts`, `lib/global-styles.ts`, `schemas/global-foundation.ts`, and related tests: write named Tailwind/global tokens before component code.
- Create `schemas/interaction-behavior.ts`, `lib/interaction-behavior.ts`, and tests: classify `static`, `css-state`, `client-state`, `form-integration`, and `motion`; verify or surface unresolved behavior.
- Modify `scripts/lib/visual-verify-core.ts`, `lib/verify-component.ts`, `lib/run-page-assembly.ts`, and tests: report similarity as readiness and pixel diff as diagnostics.
- Modify `lib/discovery-v2.ts`, `lib/reference-screenshot-fallback.ts`, or visual helper tests as needed for sticky top-mask behavior.
- Modify `skills/migrate-continue/SKILL.md`, `skills/migrate-status/SKILL.md`, `knowledge/phase-pitfalls/visual.md`, `CONTEXT.md`, and `.ai/memory/lessons.md` only where contracts change.

---

## Task 1: Non-Destructive Component Writes

**Files:**
- Modify: `lib/implement-component.ts`
- Modify: `lib/run-component-batch.ts`
- Modify: `schemas/component-batch-report.ts`
- Test: `test/implement-component.test.ts`
- Test: `test/run-component-batch.test.ts`

- [x] **Step 1: Write failing implement-component test**

Add a test proving `implementComponent` refuses to overwrite an existing component or story file by default:

```ts
expect(() =>
  implementComponent({ targetDir, entry: approvedEntry() }),
).toThrow(/Refusing to overwrite existing component artifact/);
```

Expected failure before implementation: the current function overwrites the file and the assertion fails.

- [x] **Step 2: Run focused red test**

Run:

```bash
pnpm test -- test/implement-component.test.ts
```

Expected: FAIL for the new overwrite-protection test only.

- [x] **Step 3: Implement non-destructive write policy**

Add an optional `writePolicy?: "error-if-exists" | "overwrite"` to `ImplementComponentArgs`, default it to `"error-if-exists"`, and check both output paths before writing. Preserve existing first-run behavior.

- [x] **Step 4: Run focused green test**

Run:

```bash
pnpm test -- test/implement-component.test.ts
```

Expected: PASS.

- [x] **Step 5: Write failing batch test**

Add a `runComponentBatch` test where one component implementation throws the new collision error and a second component still runs. Assert the report has a failed entry for the collided component, no approval files, and no batch abort.

- [x] **Step 6: Run focused red test**

Run:

```bash
pnpm test -- test/run-component-batch.test.ts
```

Expected: FAIL because implementation errors currently abort the batch.

- [x] **Step 7: Implement per-component implementation error reporting**

Wrap `implementComponent` per entry. If implementation fails, append a failed report entry with `verification: "FAIL"`, empty paths/URLs, all required viewports marked failing, and `error` set to the thrown message.

- [x] **Step 8: Run focused green tests**

Run:

```bash
pnpm test -- test/implement-component.test.ts test/run-component-batch.test.ts
```

Expected: PASS.

---

## Task 2: Storybook URL, Scaffold, And Server Lifecycle

**Files:**
- Modify: `lib/storybook-url.ts`
- Modify: `lib/storybook-scaffold.ts`
- Create: `lib/storybook-server.ts`
- Modify: `lib/run-component-batch.ts`
- Test: `test/storybook-url.test.ts`
- Test: `test/storybook-scaffold.test.ts`
- Test: `test/storybook-server.test.ts`
- Test: `test/run-component-batch.test.ts`

- [x] **Step 1: Write failing Storybook URL tests**

Assert `componentStorybookUrl("http://127.0.0.1:6006", "Hero", "HeroVariant2")` returns an iframe URL:

```text
http://127.0.0.1:6006/iframe.html?id=migrated-components-hero--hero-variant2&viewMode=story
```

Also add `componentStorybookReviewUrl` for the manager UI:

```text
http://127.0.0.1:6006/?path=/story/migrated-components-hero--hero-variant2
```

- [x] **Step 2: Run focused red test**

Run:

```bash
pnpm test -- test/storybook-url.test.ts
```

Expected: FAIL because only manager URLs exist today.

- [x] **Step 3: Implement iframe and review URL helpers**

Keep URL slugging deterministic and shared. Use iframe URLs for screenshots and review URLs for user-facing report links.

- [x] **Step 4: Write failing scaffold lifecycle tests**

Extend scaffold tests to assert Next-compatible Storybook config and existing-file preservation. Create server lifecycle tests with injected `spawn`, `getPort`, `fetch`, and clock helpers proving:

- free port is selected;
- process starts with `pnpm storybook -- --port <port> --ci`;
- readiness waits for `/iframe.html`;
- `stop()` kills the process after success and after failed work.

- [x] **Step 5: Run focused red tests**

Run:

```bash
pnpm test -- test/storybook-scaffold.test.ts test/storybook-server.test.ts
```

Expected: FAIL for missing lifecycle helper and scaffold expectations.

- [x] **Step 6: Implement lifecycle**

Add `withStorybookServer({ targetDir, run })` that ensures the scaffold, starts Storybook when no base URL is injected, passes `{ baseUrl }` into `run`, and tears down in `finally`.

- [x] **Step 7: Wire batch verification**

Update `runComponentBatch` so default verification runs inside `withStorybookServer`. Tests continue to inject `storybookBaseUrl` to avoid starting a real server.

- [x] **Step 8: Run focused green tests**

Run:

```bash
pnpm test -- test/storybook-url.test.ts test/storybook-scaffold.test.ts test/storybook-server.test.ts test/run-component-batch.test.ts
```

Expected: PASS.

---

## Task 3: Guided Extraction Before Component Batches

**Files:**
- Create: `lib/guided-extraction.ts`
- Modify: `lib/migration-paths.ts`
- Modify: `lib/continue.ts`
- Modify: `lib/run-component-batch.ts`
- Test: `test/guided-extraction.test.ts`
- Test: `test/continue.test.ts`
- Test: `test/run-component-batch.test.ts`

- [x] **Step 1: Write failing guided extraction test**

Build a fixture with `.migration/discovery/sections.json`, `.migration/discovery/probe.json`, and page references. Assert `ensureGuidedExtractionReady`:

- extracts every selected page into `.migration/pages/<slug>/spec`;
- runs JSX generation into `.migration/pages/<slug>/generated`;
- skips pages whose manifest and generated files are already present;
- writes `.migration/reports/guided-extraction/<artifactVersion>.json`.

- [x] **Step 2: Run focused red test**

Run:

```bash
pnpm test -- test/guided-extraction.test.ts
```

Expected: FAIL because the helper does not exist.

- [x] **Step 3: Implement guided extraction helper**

Use existing `extractPage` and `runJsxGeneration`. Read adapter paths from `.migration/discovery/probe.json`; read slugs from raw page references; return structured skipped/extracted/generated/error entries.

- [x] **Step 4: Write failing continue/batch ordering test**

Assert the default component-batch dispatcher calls guided extraction before `runComponentBatch` and does not call batch implementation when extraction fails.

- [x] **Step 5: Run focused red test**

Run:

```bash
pnpm test -- test/continue.test.ts test/run-component-batch.test.ts
```

Expected: FAIL before wiring.

- [x] **Step 6: Wire extraction before batches**

In `defaultDispatchers().implementComponentBatch`, call `ensureGuidedExtractionReady({ targetDir, artifactVersion })` before `runComponentBatch`.

- [x] **Step 7: Run focused green tests**

Run:

```bash
pnpm test -- test/guided-extraction.test.ts test/continue.test.ts test/run-component-batch.test.ts
```

Expected: PASS.

---

## Task 4: Design-System Foundation Generator

**Files:**
- Create or modify: `lib/design-system-foundation.ts`
- Modify: `lib/global-styles.ts`
- Modify: `schemas/global-foundation.ts`
- Modify: `lib/guided-extraction.ts`
- Test: `test/design-system-foundation.test.ts`
- Test: `test/build.test.ts`

- [x] **Step 1: Write failing foundation generator test**

Given a `00-globals.json` with body, colors, radii, section padding, spacing, and container values, assert the generated `src/app/globals.css` contains:

- `@import "tailwindcss";`
- root `--background` and `--foreground`;
- named `@theme inline` tokens for colors, font, radii, spacing, section padding, and container width;
- no scaffold `prefers-color-scheme` block.

- [x] **Step 2: Run focused red test**

Run:

```bash
pnpm test -- test/design-system-foundation.test.ts test/build.test.ts
```

Expected: FAIL because only a minimal body foundation exists.

- [x] **Step 3: Implement generator**

Render deterministic, sanitized token names from the extracted global foundation. Keep fallbacks for sparse `00-globals.json` so existing fixtures remain valid.

- [x] **Step 4: Wire before component code**

Call the foundation writer from guided extraction or batch setup before component implementation. Keep `runBuild` compatible by delegating its current globals render to the same helper.

- [x] **Step 5: Run focused green tests**

Run:

```bash
pnpm test -- test/design-system-foundation.test.ts test/build.test.ts test/guided-extraction.test.ts
```

Expected: PASS.

---

## Task 5: Interaction Behavior Schema, Classifier, And Verifier

**Files:**
- Create: `schemas/interaction-behavior.ts`
- Create: `lib/interaction-behavior.ts`
- Modify: `schemas/component-batch-report.ts`
- Modify: `lib/run-component-batch.ts`
- Modify: `lib/verify-component.ts`
- Test: `test/interaction-behavior.test.ts`
- Test: `test/run-component-batch.test.ts`
- Test: `test/verify-component.test.ts`

- [x] **Step 1: Write failing schema/classifier tests**

Assert the schema accepts the five interaction classes and rejects unknown classes. Add fixtures proving:

- plain content classifies as `static`;
- hover/focus evidence classifies as `css-state`;
- nav/menu/carousel/tab/accordion evidence classifies as `client-state`;
- form evidence classifies as `form-integration`;
- animation/IX2/marquee/video autoplay evidence classifies as `motion`.

- [x] **Step 2: Run focused red test**

Run:

```bash
pnpm test -- test/interaction-behavior.test.ts
```

Expected: FAIL because files do not exist.

- [x] **Step 3: Implement classifier**

Use section signals, tag skeletons, sample text, selectors, generated source snippets, and optional animation/spec evidence. Return `class`, `evidence`, `requiredChecks`, and `unresolvedBehavior` for classes that require implementation evidence.

- [x] **Step 4: Write failing verifier/report tests**

Assert `verifyComponent` can include behavior check results and `runComponentBatch` writes interaction details for every content component. Static and CSS-state components may pass without unresolved behavior; `client-state`, `form-integration`, and `motion` require either verified checks or explicit unresolved items.

- [x] **Step 5: Run focused red tests**

Run:

```bash
pnpm test -- test/verify-component.test.ts test/run-component-batch.test.ts
```

Expected: FAIL before report/verifier wiring.

- [x] **Step 6: Wire behavior into verification**

Add dependency-injected behavior verification so unit tests do not launch browsers. The default implementation should use `BrowserWorkQueue` when browser state checks are present.

- [x] **Step 7: Run focused green tests**

Run:

```bash
pnpm test -- test/interaction-behavior.test.ts test/verify-component.test.ts test/run-component-batch.test.ts
```

Expected: PASS.

---

## Task 6: Similarity Metric And Pixel Diff Diagnostics

**Files:**
- Modify: `scripts/lib/visual-verify-core.ts`
- Modify: `lib/verify-component.ts`
- Modify: `lib/run-page-assembly.ts`
- Modify: `schemas/component-batch-report.ts`
- Modify: `schemas/page-assembly-report.ts`
- Test: `scripts/tests/visual-verify-core.test.ts` if Vitest include is updated, otherwise mirror coverage under `test/visual-verify-core.test.ts`
- Test: `test/verify-component.test.ts`
- Test: `test/run-page-assembly.test.ts`

- [x] **Step 1: Write failing similarity tests**

Add PNG fixtures in memory proving:

- identical images score `1`;
- small vertical offset still scores above `0.92`;
- different structure scores below threshold;
- raw pixel mismatch remains available as a diagnostic ratio.

- [x] **Step 2: Run focused red test**

Run:

```bash
pnpm test -- test/visual-verify-core.test.ts
```

Expected: FAIL for missing similarity helper.

- [x] **Step 3: Implement shift-tolerant similarity**

Add a deterministic helper such as `assessVisualSimilarity` that searches small x/y offsets, returns `similarity`, `bestOffset`, `pixelDiffRatio`, and diagnostics. Do not remove `diffNormalizedPngs`; keep pixel diff output for artifacts.

- [x] **Step 4: Wire verification readiness to similarity**

Update component and page verification reports to use similarity thresholds (`0.92` default, configurable per call) for readiness while still writing diff PNGs and raw pixel ratios as diagnostics.

- [x] **Step 5: Run focused green tests**

Run:

```bash
pnpm test -- test/visual-verify-core.test.ts test/verify-component.test.ts test/run-page-assembly.test.ts
```

Expected: PASS.

---

## Task 7: Sticky Header / Top-Mask Visual Harness Fix

**Files:**
- Modify: `lib/discovery-v2.ts`
- Modify: `lib/reference-screenshot-fallback.ts`
- Modify: `scripts/lib/visual-verify-core.ts` if shared masking belongs there
- Test: `test/discovery-v2.test.ts`
- Test: `test/reference-screenshot-fallback.test.ts`
- Test: `test/visual-verify-core.test.ts`

- [x] **Step 1: Write failing sticky/top-mask tests**

Create focused tests that simulate a sticky header occupying the top of the viewport and a section below it. Assert component reference crops exclude the sticky header overlay unless the sticky element is the section being captured.

- [x] **Step 2: Run focused red test**

Run:

```bash
pnpm test -- test/discovery-v2.test.ts test/reference-screenshot-fallback.test.ts test/visual-verify-core.test.ts
```

Expected: FAIL before masking/crop adjustment.

- [x] **Step 3: Implement top-mask/crop adjustment**

Prefer full-page crop coordinates from immutable section bounding boxes over scrolled element screenshots when a sticky/fixed top overlay would contaminate the component reference. Keep direct element screenshots for ordinary sections.

- [x] **Step 4: Run focused green tests**

Run:

```bash
pnpm test -- test/discovery-v2.test.ts test/reference-screenshot-fallback.test.ts test/visual-verify-core.test.ts
```

Expected: PASS.

---

## Task 8: Skill And Docs Cleanup

**Files:**
- Modify: `skills/migrate-continue/SKILL.md`
- Modify: `skills/migrate-status/SKILL.md` if status output changes
- Modify: `knowledge/phase-pitfalls/visual.md`
- Modify: `CONTEXT.md` if vocabulary changes
- Modify: `.ai/memory/lessons.md` if a non-obvious maintainer pitfall is discovered
- Test: `test/migration-skill-contracts.test.ts`
- Test: any affected skill contract tests

- [x] **Step 1: Write failing skill/docs tests where possible**

Add assertions that `/migrate:continue` mentions extraction before component batches, Storybook review links, interaction behavior status, and similarity-first diagnostics.

- [x] **Step 2: Run focused red test**

Run:

```bash
pnpm test -- test/migration-skill-contracts.test.ts
```

Expected: FAIL if docs/skill text has not been updated.

- [x] **Step 3: Update skills and runtime knowledge**

Keep public language English-only and aligned with `.ai/LANGUAGE.md`: Design System Foundation, Component Story, Interaction Class, Perceptual Verification Metric, Pixel Diff Diagnostic.

- [x] **Step 4: Run focused green test**

Run:

```bash
pnpm test -- test/migration-skill-contracts.test.ts
```

Expected: PASS.

---

## Final Verification

- [x] Run affected focused tests after each task.
- [x] Run `pnpm typecheck`.
- [x] Run full `pnpm test`.
- [x] Run `git diff --check`.
- [x] Review `git diff` for debug artifacts, unintended files, generated migration output, `.migration/`, logs, screenshots, and local settings.
- [ ] Invoke `wiki-update` at session end per repo instructions.
