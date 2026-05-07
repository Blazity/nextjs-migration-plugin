# Implementation Plan — Guided Component-First Migration Flow

**Date:** 2026-05-07
**Spec:** [docs/specs/2026-05-07-guided-component-first-flow.md](../../docs/specs/2026-05-07-guided-component-first-flow.md)
**Language:** [CONTEXT.md](../../CONTEXT.md)
**Status:** Draft, ready for execution

---

## Context

The plugin currently exposes the user to an old execution model: a five-question wizard that asks for `mode` (attended/unattended) and `goal` (wireframe/pixel-perfect), a `/migrate:config` command for tuning those choices, eight numbered phases (`phase-1-discover` … `phase-8-perf`), a roadmap-approval gate, and a sprawling slash-command surface (`/migrate:discover`, `/migrate:analyze`, `/migrate:plan`, `/migrate:extract`, `/migrate:build`, `/migrate:polish`, `/migrate:verify`, `/migrate:config`).

The new spec replaces that with one **Guided Migration Flow** organised around three concrete user approvals (Component Inventory Review, Component Batch Approval, Page Layout Approval). Internal phases and scheduling continue to exist for resumability, but they stop being the product workflow. Component-first beats page-first, browser work funnels through a single shared queue, approved migrated baselines guard against regressions at 0.1%, and chat-driven natural-language correction replaces editable UI.

This plan walks the codebase from the current state to the target state in TDD-first, commit-sized steps. Each task lists exact files, the failing test to write first, the commands to run, expected output, the minimal code change, the verification step, and the commit message. Phases are numbered for ordering, not for user-visible workflow.

## Guiding rules

- **TDD always.** Write the failing test, run `pnpm test <pattern>` to confirm it fails for the right reason, write the minimum implementation, re-run the test, then run `pnpm typecheck`.
- **Vitest convention.** New tests live next to existing ones in `test/` (or `scripts/tests/` for vendored-script behaviour). File naming: `<feature>.test.ts`. Run pattern: `pnpm test -- <pattern>`.
- **Commit cadence.** One commit per task unless explicitly grouped. Commit messages use the existing `type(scope): brief message` convention; scope `plugin` for cross-cutting changes, narrower scopes (`schemas`, `state`, `inventory`, `queue`, `approvals`, `commands`) for focused work.
- **Vendored scripts policy.** Do not edit `scripts/lib/visual-verify-core.ts` algorithm logic without a vendor-policy commit. New thresholds are passed as options or set in plugin-side wrappers.
- **Tracking ID hygiene.** `Section Instance ID` may appear in JSON metadata and optional source comments only. It must never appear in a generated component file name or component symbol. The existing `sanitizeComponentName` already enforces ID-shaped fallback symbols (`Component<index>`); the new approval gate must reject those names at approval time.
- **Phase directory legacy.** The current `phase-1-discover` … `phase-8-perf` directories will not be created any more by `/migrate:new` once Phase 3 lands. Recovery tools (`lib/discover.ts`, `lib/analyze.ts`, `lib/plan.ts`, etc.) keep producing legacy directories so existing tests stay green; we wire them as recovery-only.

## Critical existing files this plan touches or reuses

- [schemas/site.ts](../../schemas/site.ts) — drops `mode` and `goal` (Phase 1, Phase 2)
- [lib/new-migration.ts](../../lib/new-migration.ts) — strips mode/goal flags (Phase 1)
- [lib/bootstrap.ts](../../lib/bootstrap.ts) — stops writing Goal/Mode lines (Phase 1)
- [lib/phase-status.ts](../../lib/phase-status.ts) — replace `knownPhases` array with v2 step list (Phase 2)
- [lib/continue.ts](../../lib/continue.ts) — rewrite `resumeMigration` against approval state (Phase 6)
- [lib/discover.ts](../../lib/discover.ts) — drop attended/unattended branch (Phase 1) and keep as recovery-only entry (Phase 12)
- [lib/component-tsx-emitter.ts](../../lib/component-tsx-emitter.ts) — already keeps tracking IDs out of filenames; we add an approval-time validator (Phase 5)
- [lib/section-signature.ts](../../lib/section-signature.ts) — reuse `signatureDigest` for artifact hashing (Phase 2)
- [scripts/lib/visual-verify-core.ts](../../scripts/lib/visual-verify-core.ts) — reuse `diffNormalizedPngs`, `assessDiffResult` with caller-passed `maxDiffRatio` (Phase 7, Phase 9, Phase 10)
- [commands/migrate-config.md](../../commands/migrate-config.md), [skills/migrate-config/](../../skills/migrate-config/) — deleted from user surface (Phase 11)
- [commands/migrate-discover.md](../../commands/migrate-discover.md), `migrate-analyze`, `migrate-plan`, `migrate-extract`, `migrate-build`, `migrate-polish`, `migrate-verify` — moved to recovery-only docs in Phase 11 / Phase 12

---

## Phase 0 — Plan kickoff and baseline

**Goal:** confirm the suite is green before any change, so every later red→green test cycle is unambiguous.

### Task 0.1 — Capture baseline

- **Files:** none
- **Command:** `pnpm install && pnpm test && pnpm typecheck`
- **Expected:** all pass. If anything is red on the worktree, halt and ask the user before continuing.
- **Commit:** none (read-only).

---

## Phase 1 — Remove user-facing mode/goal/config flow

**Goal:** the user no longer sees `attended | unattended` or `wireframe | pixel-perfect`. State stops carrying those keys.

**Decision baked in:** `mode` and `goal` are removed outright in v1. No deprecation path, no accept-and-ignore for legacy SITE.md. Existing `.migration/` directories from earlier iterations are not preserved — re-run `/migrate:new` against a clean target.

### Task 1.1 — `SiteFrontmatterSchema` drops `mode` and `goal`

- **Files to modify:** [schemas/site.ts](../../schemas/site.ts), [test/site-schema.test.ts](../../test/site-schema.test.ts), [test/load-site.test.ts](../../test/load-site.test.ts)
- **Failing test first** (`test/site-schema.test.ts`):
  - Add: `it("rejects unknown legacy keys 'mode' and 'goal'", ...)` asserting `SiteFrontmatterSchema.safeParse({ ..., mode: "attended", goal: "wireframe" })` is `success: false` because the schema is strict.
  - Add: `it("parses a minimal site with only sourceUrl, target, inputMode, initialPageSelection, maxParallel*", ...)` asserting `mode` and `goal` are absent from the inferred type.
- **Run:** `pnpm test -- site-schema`. Expect failure: legacy keys still accepted.
- **Implementation:**
  - Replace `SiteFrontmatterSchema` with a strict object: `sourceUrl`, `target`, `inputMode`, `sourceRepo?`, `initialPageSelection`, `maxParallelPages`, `maxParallelSections`. Use `.strict()`.
  - Remove `mode` and `goal` exports.
- **Run:** `pnpm test -- site-schema` (green), `pnpm test -- load-site` (likely red — fix fixtures), `pnpm typecheck` (red — many call sites still read `site.mode` / `site.goal`; tracked in 1.2–1.5).
- **Commit:** `refactor(schemas): drop mode and goal from SiteFrontmatterSchema`.

### Task 1.2 — `runNewMigration` and `new-migration` CLI shed mode/goal flags

- **Files to modify:** [lib/new-migration.ts](../../lib/new-migration.ts), [test/new-migration.test.ts](../../test/new-migration.test.ts)
- **Failing test first:**
  - Add: `it("ignores --mode and --goal flags if passed (no-op, deprecated)", ...)` asserting the parsed args do not contain those keys.
  - Update existing tests to drop mode/goal from inputs.
- **Run:** `pnpm test -- new-migration`. Expect failure on legacy assertions.
- **Implementation:**
  - Remove `mode`, `goal` from `NewMigrationArgs` and CLI arg parser. Treat `--mode` / `--goal` flags as silently ignored for one release.
  - Bootstrap call no longer passes those keys.
- **Run:** `pnpm test -- new-migration` (green).
- **Commit:** `refactor(state): runNewMigration drops mode/goal arguments`.

### Task 1.3 — `bootstrapMigration` stops writing Goal/Mode lines

- **Files to modify:** [lib/bootstrap.ts](../../lib/bootstrap.ts), [test/bootstrap.test.ts](../../test/bootstrap.test.ts)
- **Failing test first:**
  - Update bootstrap tests to assert that the generated `RUN.md` does **not** contain the strings `Goal:` or `Mode:`.
  - Assert `SITE.md` frontmatter does not contain `mode:` or `goal:` keys.
- **Run:** `pnpm test -- bootstrap`. Expect failure: current code writes those lines.
- **Implementation:**
  - In `bootstrap.ts`, drop the `Goal:` and `Mode:` lines from the `RUN.md` template.
  - Stop persisting `mode`/`goal` to `SITE.md` frontmatter (already gone from schema, but ensure no incidental writes remain).
- **Run:** `pnpm test -- bootstrap` (green).
- **Commit:** `refactor(state): SITE.md no longer records mode/goal`.

### Task 1.4 — `/migrate:new` skill drops the goal and mode questions

- **Files to modify:** [skills/migrate-new/SKILL.md](../../skills/migrate-new/SKILL.md), [test/migration-skill-contracts.test.ts](../../test/migration-skill-contracts.test.ts)
- **Failing test first:**
  - In the skill-contracts test, assert that `skills/migrate-new/SKILL.md` content does **not** contain the substrings `wireframe`, `pixel-perfect`, `attended`, `unattended`, or `Mode:`/`Goal:` question headers.
- **Run:** `pnpm test -- migration-skill-contracts`. Expect failure.
- **Implementation:**
  - Rewrite SKILL.md from a five-question wizard to a three-question flow: target dir, source-repo (optional), initial page selection. Remove Step 5 (continue unattended) entirely; replace Step 4 with: "On success, the next message is the Component Inventory Review summary."
  - Remove the `--mode` / `--goal` flags from the bash template.
- **Run:** `pnpm test -- migration-skill-contracts` (green).
- **Commit:** `docs(skills): /migrate:new drops mode and goal questions`.

### Task 1.5 — Compile-fix all `site.mode` / `site.goal` reads

- **Files to modify (read-fix or remove):** [lib/discover.ts](../../lib/discover.ts), [lib/continue.ts](../../lib/continue.ts), [lib/phase-status.ts](../../lib/phase-status.ts), [lib/plan.ts](../../lib/plan.ts), [lib/polish.ts](../../lib/polish.ts), [lib/load-roadmap.ts](../../lib/load-roadmap.ts), [skills/migrate-status/SKILL.md](../../skills/migrate-status/SKILL.md), [skills/migrate-help/SKILL.md](../../skills/migrate-help/SKILL.md). Tests under `test/continue-*.integration.test.ts`, `test/discover.test.ts`, `test/plan*.test.ts`, `test/polish.test.ts`, `test/status.test.ts`.
- **Failing tests first:**
  - For each integration test still passing `mode: "attended"` or `goal: "pixel-perfect"`, change the input to a v2 site (no mode/goal). Adjust the assertion for any user-prompt branches (collapse the two paths into the single guided path).
  - In `test/status.test.ts`, assert that the status summary string no longer mentions Mode/Goal.
- **Run:** `pnpm test`. Expect compile errors and assertion failures.
- **Implementation:**
  - In `lib/discover.ts`, drop `mode` argument paths and the `pageListGate = isUnattended(mode)` branch — gate now uses inventory approval (Phase 6).
  - In `lib/phase-status.ts`, temporarily relax the `goal` parameter to optional; this file is fully replaced in Phase 2 / Phase 6.
  - In `lib/plan.ts`, drop the attended-vs-unattended approval branch (the whole `runPlan` is later marked recovery-only in Phase 12; for now keep the algorithmic path only and strip mode reads).
  - In `lib/polish.ts`, drop the goal check; this file becomes recovery-only in Phase 12.
  - In `lib/load-roadmap.ts` / `schemas/roadmap.ts`, drop `mode`/`goal` fields, default `parallelism` if necessary.
  - Update `migrate-status` and `migrate-help` SKILL.md to delete every Mode/Goal line.
- **Run:** `pnpm test && pnpm typecheck`. All green.
- **Commit:** `refactor(plugin): purge mode/goal reads across libs and skills`.

### Task 1.6 — Delete `/migrate:config` from the user surface (soft delete now, hard delete in Phase 11)

- **Files to modify:** [skills/migrate-help/SKILL.md](../../skills/migrate-help/SKILL.md), [test/migrate-help-skill.test.ts](../../test/migrate-help-skill.test.ts), [test/migration-skill-contracts.test.ts](../../test/migration-skill-contracts.test.ts)
- **Failing test first:**
  - Assert the rendered help text does not mention `/migrate:config`, `mode `, or `goal `.
- **Run:** `pnpm test -- migrate-help-skill`. Expect failure.
- **Implementation:**
  - Remove the "Useful controls" subsection that documents `/migrate:config`. Replace with a one-line note: "Threshold and concurrency settings are advanced state — `/migrate:status` displays them, and you can ask in chat to change them."
- **Run:** `pnpm test`. Green.
- **Commit:** `docs(skills): drop /migrate:config from /migrate:help`.

---

## Phase 2 — New state schemas (raw discovery, draft inventory, approved inventory, approvals, hashes, baselines)

**Goal:** introduce the durable state model the new flow needs, validated by Zod.

### Task 2.1 — Raw discovery evidence schema

- **Files to create:** `schemas/raw-discovery.ts`, `test/raw-discovery-schema.test.ts`
- **Purpose:** describe the immutable `.migration/discovery/sections.json` and the `.migration/references/**` manifest.
- **Failing test first** (`test/raw-discovery-schema.test.ts`):
  - Test the schema rejects empty `sections`, missing `referenceScreenshots`, or unknown viewport ints.
  - Test it accepts a minimal valid record: `{ probedAt, pages: [{ url, sections: [...] }], references: { components: [...], pages: [...] } }`.
- **Run:** `pnpm test -- raw-discovery-schema`. Expect failure (file does not exist).
- **Implementation:**
  - `RawDiscoveryEvidenceSchema = z.object({ probedAt: z.string().datetime(), pages: z.array(PageSectionsSchema), referenceScreenshots: z.object({ components: z.array(ComponentReferenceSchema), pages: z.array(PageReferenceSchema) }), source: z.object({ sourceUrl: z.string().url(), capturedAt: z.string().datetime() }) }).strict()`.
  - `ComponentReferenceSchema = z.object({ sectionInstanceId: z.string().min(1), url: z.string().url(), viewport: z.union([z.literal(390), z.literal(768), z.literal(1440)]), path: z.string().min(1), sha256: z.string().regex(/^[0-9a-f]{16,64}$/) }).strict()`.
  - `PageReferenceSchema` parallels but keys on `slug` and `viewport`.
  - Reuse [schemas/sections.ts](../../schemas/sections.ts) `PageSectionsSchema` for `pages`.
- **Run:** `pnpm test -- raw-discovery-schema && pnpm typecheck`.
- **Commit:** `feat(schemas): add raw-discovery evidence schema`.

### Task 2.2 — Draft inventory schema

- **Files to create:** `schemas/draft-inventory.ts`, `test/draft-inventory-schema.test.ts`
- **Failing test first:**
  - Reject components whose `name` matches `/^Component\d+$/` or contains a `Section Instance ID` (regex `/p\d+-s\d+/`). This enforces the spec rule: "Inventory approval is blocked while any implementation component name is generic or ID-like."
  - Accept a minimal valid record with one component group, one section instance, semantic `Hero` name.
- **Run:** `pnpm test -- draft-inventory-schema`. Expect failure.
- **Implementation:**
  - `DraftInventoryEntrySchema = z.object({ componentGroupId: z.string().min(1), proposedName: z.string().min(1), kind: z.enum(["shell", "content"]), sectionInstanceIds: z.array(z.string().min(1)).min(1), notes: z.string().optional() }).strict()`.
  - `DraftInventorySchema = z.object({ generatedAt: z.string().datetime(), revision: z.number().int().nonnegative(), entries: z.array(DraftInventoryEntrySchema) }).strict()`.
  - Names are validated leniently here — semantic-name enforcement lives in Task 5.x at approval time, not at schema time, so chat-driven correction can write half-finished drafts.
- **Run:** tests green, typecheck green.
- **Commit:** `feat(schemas): add draft inventory schema`.

### Task 2.3 — Approved inventory schema

- **Files to create:** `schemas/approved-inventory.ts`, `test/approved-inventory-schema.test.ts`
- **Failing test first:**
  - Reject `name` of `Component3`, `p0-s0`, `Section1`. (Stricter than draft.)
  - Accept `Hero`, `PricingCard`, `SiteHeader`.
- **Implementation:**
  - `ApprovedInventoryEntrySchema = DraftInventoryEntrySchema.extend({ implementationName: z.string().regex(/^[A-Z][A-Za-z0-9]*$/).refine(n => !/^Component\d+$/.test(n) && !/p\d+-s\d+/.test(n) && !/^Section\d+$/.test(n), "implementation name must be semantic, not generic or ID-like"), filePath: z.string().regex(/^src\/components\/[A-Z][A-Za-z0-9]*\.tsx$/) })`.
  - `ApprovedInventorySchema = z.object({ approvedAt: z.string().datetime(), artifactVersion: z.string().regex(/^[0-9a-f]{16}$/), entries: z.array(ApprovedInventoryEntrySchema) }).strict()`.
- **Commit:** `feat(schemas): add approved inventory schema`.

### Task 2.4 — Approval-record schema (shared)

- **Files to create:** `schemas/approval.ts`, `test/approval-schema.test.ts`
- **Failing test first:**
  - Test all three kinds parse: `component-inventory`, `component-batch`, `page-layout`.
  - Test that `artifactVersion` is required and `staleSince` is optional.
- **Implementation:**
  - `ApprovalRecordSchema = z.discriminatedUnion("kind", [ ComponentInventoryApprovalSchema, ComponentBatchApprovalSchema, PageLayoutApprovalSchema ])` where each variant carries `kind`, `approvedAt`, `artifactVersion`, optional `userNotes`, optional `staleSince` (a timestamp set when the underlying artifact hash changes).
  - Component-batch carries `componentGroupIds` and `implementationNames`. Page-layout carries `slug`, `componentGroupIds`, and `pageReferenceVersion`.
- **Commit:** `feat(schemas): add approval-record discriminated union`.

### Task 2.5 — Artifact hash helper

- **Files to create:** `lib/artifact-hash.ts`, `test/artifact-hash.test.ts`
- **Failing test first:**
  - Two structurally-equal records produce the same 16-char SHA256 prefix.
  - Two records that differ in one field produce different hashes.
  - Hash is order-insensitive for object keys (canonicalised before hashing).
- **Implementation:**
  - Reuse the digest pattern from [lib/section-signature.ts](../../lib/section-signature.ts) `signatureDigest` (Node `crypto`).
  - Export `hashArtifact(value: unknown): string` that returns the first 16 hex chars of SHA256 over a stable JSON stringify (sorted keys).
- **Commit:** `feat(state): artifact hashing helper for approval staleness checks`.

### Task 2.6 — Approved-baseline schema

- **Files to create:** `schemas/approved-baseline.ts`, `test/approved-baseline-schema.test.ts`
- **Failing test first:**
  - Reject diff thresholds outside (0, 0.05].
  - Accept the default `0.001` (0.1%).
- **Implementation:**
  - `ApprovedBaselineSchema = z.object({ approvalRef: z.string().min(1), kind: z.enum(["component", "page"]), capturedAt: z.string().datetime(), regressionThreshold: z.number().gt(0).lte(0.05).default(0.001), screenshots: z.array(z.object({ viewport: z.union([z.literal(390), z.literal(768), z.literal(1440)]), path: z.string(), sha256: z.string() })) }).strict()`.
- **Commit:** `feat(schemas): add approved-baseline schema`.

### Task 2.7 — On-disk layout helper

- **Files to create:** `lib/migration-paths.ts`, `test/migration-paths.test.ts`
- **Failing test first:**
  - `migrationPaths("/proj").rawDiscovery` returns `/proj/.migration/discovery/sections.json`.
  - `migrationPaths("/proj").draftInventory` returns `/proj/.migration/inventory/component-inventory.json`.
  - `migrationPaths("/proj").reviewHtml` returns `/proj/.migration/inventory/inventory-review.html` (sibling of the JSON; image references are stored as paths relative to `.migration/inventory/`).
  - `migrationPaths("/proj").approvedInventory` returns `/proj/.migration/approvals/component-inventory.json`.
  - `migrationPaths("/proj").componentApproval("hero")` returns `/proj/.migration/approvals/components/hero.json`.
  - `migrationPaths("/proj").pageApproval("pricing")` returns `/proj/.migration/approvals/pages/pricing.json`.
  - `migrationPaths("/proj").componentReference({ sectionInstanceId, viewport })` returns `/proj/.migration/references/components/<id>-<viewport>.png`.
  - `migrationPaths("/proj").approvedBaseline({ kind, slugOrName, viewport })` returns `/proj/.migration/baselines/<kind>/<slug-or-name>-<viewport>.png`.
- **Implementation:** plain function returning a frozen object of derived paths. Used by every later task that reads/writes state.
- **Commit:** `feat(state): centralised migration-state path helper`.

---

## Phase 3 — `/migrate:new` reaches the Component Inventory Review

**Goal:** running `/migrate:new <url>` initialises state, performs deterministic discovery (crawl, probe, section discovery, screenshot capture), generates the draft inventory, and stops at the read-only review. No more `phase-1-discover` directory.

### Task 3.1 — Discovery runner v2 (writes raw evidence directly into `.migration/discovery` and `.migration/references`)

- **Files to create:** `lib/discovery-v2.ts`, `test/discovery-v2.test.ts`. Reuse: `lib/crawl-runner.ts`, `lib/probe-runner.ts`, `lib/discover-sections-runner.ts`, `scripts/lib/section-discovery.ts`.
- **Failing test first** (`test/discovery-v2.test.ts`):
  - Drives a tiny in-process HTTP fixture and asserts the runner writes `.migration/discovery/sections.json` (validates against `RawDiscoveryEvidenceSchema`) and at least one component reference screenshot per section under `.migration/references/components/`.
  - Asserts no `phase-1-discover` directory is created.
- **Run:** `pnpm test -- discovery-v2`. Expect failure.
- **Implementation:**
  - Compose existing runners: crawl → probe → section-discovery → screenshot-capture for each viewport (390/768/1440).
  - Skip overlay/cookie banners using existing `scripts/lib/cookie-consent.ts`.
  - Hash each PNG and write a manifest. The manifest validates against `RawDiscoveryEvidenceSchema`.
- **Run:** target test green; no breakage in unrelated tests.
- **Commit:** `feat(discovery): v2 runner writes raw evidence outside legacy phase dirs`.

### Task 3.2 — Draft inventory builder

- **Files to create:** `lib/inventory-builder.ts`, `test/inventory-builder.test.ts`
- **Failing test first:**
  - Given a fixture `RawDiscoveryEvidence` with five sections clustered into two groups by signature (reuse `lib/section-signature.ts` `signatureDigest`), the builder produces a `DraftInventory` with two entries; section instance IDs are assigned and stable across re-runs of the same evidence.
  - One entry is marked `kind: "shell"` when its signature matches a `<header>`/`<nav>`/`<footer>` skeleton; the rest default to `kind: "content"`.
  - Initial `proposedName` is the existing component-clustering name (e.g., `Hero`); when no such name is available, the entry uses a placeholder like `UnnamedGroup1` that the schema accepts but the approval gate rejects.
- **Run:** failing.
- **Implementation:** algorithmic clustering reused from `lib/cluster.ts`; emit the JSON.
- **Commit:** `feat(inventory): draft-inventory builder from raw evidence`.

### Task 3.3 — `runMigrationStart` orchestrator

- **Files to create:** `lib/migration-start.ts`, `test/migration-start.test.ts`. Replaces the user-visible part of the old `runDiscover`.
- **Failing test first:**
  - Given a target dir without `.migration/`, the orchestrator: (a) calls `bootstrapMigration`, (b) runs `discovery-v2`, (c) runs `inventory-builder`, (d) writes the draft inventory at `migrationPaths(target).draftInventory`, (e) returns an `OutcomeReadyForReview` carrying the artifact version and a path to the review HTML (Phase 4 wires the HTML).
  - Asserts the runner does not write any approval records, no `phase-N-*` directories, and no Storybook outputs.
  - Asserts the artifact version equals `hashArtifact(draftInventory)` so corrections invalidate later approvals deterministically.
- **Run:** failing.
- **Implementation:** thin orchestrator using helpers above.
- **Commit:** `feat(state): runMigrationStart drives discovery and stops at draft inventory`.

### Task 3.4 — Storybook scaffold (eager, during Migration Start)

- **Files to create:** `lib/storybook-scaffold.ts`, `test/storybook-scaffold.test.ts`. (Originally listed under Phase 7; pulled forward so the user hits no surprises later.)
- **Failing test first:**
  - `ensureStorybookScaffold(targetDir)` creates `target/.storybook/main.ts` and `target/.storybook/preview.ts` (idempotent — second call is a no-op) and adds `storybook` and `build-storybook` scripts to the target's `package.json` if missing.
  - The scaffold registers the three reference viewports (390/768/1440) in `preview.ts`.
  - Targets Storybook 8 with the React-Vite renderer (matches Next.js App Router projects).
- **Run:** `pnpm test -- storybook-scaffold`. Expect failure.
- **Implementation:** small file generator; respects pre-existing scaffolds.
- **Commit:** `feat(storybook): idempotent target-side scaffold`.

### Task 3.5 — `runMigrationStart` calls `ensureStorybookScaffold`

- **Files to modify:** `lib/migration-start.ts`, `test/migration-start.test.ts`
- **Failing test first:** assert `target/.storybook/main.ts` exists after `runMigrationStart` for a target that did not have it pre-existing.
- **Implementation:** insert the scaffold call between `bootstrapMigration` and `discovery-v2`.
- **Commit:** `feat(state): scaffold Storybook eagerly during Migration Start`.

### Task 3.6 — `/migrate:new` skill invokes `migration-start`

- **Files to modify:** [skills/migrate-new/SKILL.md](../../skills/migrate-new/SKILL.md), [lib/new-migration.ts](../../lib/new-migration.ts), [test/new-migration.test.ts](../../test/new-migration.test.ts), [test/migration-skill-contracts.test.ts](../../test/migration-skill-contracts.test.ts)
- **Failing test first:**
  - End-to-end test (with stubbed runners): calling `runNewMigration(...)` returns the same `OutcomeReadyForReview` shape and the SKILL.md final step references the review HTML, not `/migrate:continue`.
- **Implementation:**
  - `runNewMigration` calls `bootstrapMigration` then `runMigrationStart`. Output: `{ targetDir, draftInventoryPath, reviewHtmlPath, artifactVersion }`.
  - SKILL.md final step (replaces current Step 4 + Step 5): "Open the Component Inventory Review at `[reviewHtmlPath]`. When you are ready, describe any name or grouping changes in chat. To approve, say so in chat."
- **Commit:** `feat(commands): /migrate:new reaches Component Inventory Review`.

---

## Phase 4 — Read-only inventory review HTML with viewport toggles and source links

**Goal:** generate a static `inventory-review.html` artifact in the target's `.migration/inventory/` directory.

### Task 4.1 — Review-HTML renderer

- **Files to create:** `lib/inventory-review-html.ts`, `test/inventory-review-html.test.ts`
- **Output path:** `.migration/inventory/inventory-review.html` (sibling of `component-inventory.json`). Image `src` attributes use paths relative to that location, e.g. `../references/components/<sectionInstanceId>-<viewport>.png`.
- **Failing test first:**
  - Given a `DraftInventory` and matching `RawDiscoveryEvidence`, render an HTML string that:
    - groups instances by `componentGroupId`,
    - shows the proposed semantic name and stable `sectionInstanceId`,
    - links each instance to its source URL (`<a href="...">`),
    - exposes a `<button data-viewport>390|768|1440</button>` toggle that swaps `<img src="..."/>` to the corresponding screenshot path (relative path resolves correctly when the HTML is opened from `.migration/inventory/`),
    - initially shows up to a capped sample (default 3) per group with a `<button data-action="reveal">Reveal hidden</button>` for the rest,
    - displays a banner reading "Read-only — request changes in chat" and another reading "Approval blocked: N components have generic or ID-like names" when applicable.
  - All assertions are string-contains tests; no DOM emulator needed.
- **Run:** failing.
- **Implementation:** server-side HTML emit; embed CSS/JS inline so the file is self-contained.
- **Commit:** `feat(inventory): render read-only Component Inventory Review HTML`.

### Task 4.2 — Wire HTML into `runMigrationStart`

- **Files to modify:** `lib/migration-start.ts`, `test/migration-start.test.ts`
- **Failing test:** assert `migrationPaths(target).reviewHtml` (i.e. `.migration/inventory/inventory-review.html`) exists on disk after `runMigrationStart` and contains the proposed name strings of every component group.
- **Commit:** `feat(state): migration-start emits review HTML alongside draft inventory`.

---

## Phase 5 — Chat-driven correction and regenerated inventory artifacts

**Goal:** the user describes corrections in chat ("rename Component3 to Hero", "merge group A into group B", "split section P0-S2 out of Hero"); a deterministic library function applies those corrections to the draft inventory and regenerates the review HTML and the artifact version.

### Task 5.1 — Correction operation schema

- **Files to create:** `schemas/inventory-correction.ts`, `test/inventory-correction-schema.test.ts`
- **Failing test first:**
  - Each operation type validates: `rename`, `merge`, `split`, `set-kind`, `note`. `rename` requires `componentGroupId` and `newName`. `merge` takes `targetGroupId` and `sourceGroupIds`. `split` takes `sourceGroupId`, `sectionInstanceIds`, `newGroupName`, optional `newKind`.
- **Implementation:** discriminated union of zod schemas. Validation is strict.
- **Commit:** `feat(schemas): inventory-correction operations`.

### Task 5.2 — `applyCorrections` library function

- **Files to create:** `lib/apply-inventory-corrections.ts`, `test/apply-inventory-corrections.test.ts`
- **Failing test first:**
  - Given a draft inventory with two entries `Component1` (sections P0-S0, P0-S2) and `Component2` (sections P0-S1), apply a `rename` op turning `Component1` into `Hero`. Result: same shape with new name; `revision` increments by 1.
  - `merge` collapses two entries into one with combined `sectionInstanceIds`.
  - `split` extracts named instances into a new entry; both entries' instance lists are minimal/non-empty.
  - Applying any operation results in a different `hashArtifact(...)` than before (proves the artifact-version invariant).
- **Run:** failing.
- **Implementation:** pure function over `DraftInventory`.
- **Commit:** `feat(inventory): applyCorrections produces a new draft inventory deterministically`.

### Task 5.3 — `regenerateInventoryArtifacts` orchestrator

- **Files to create:** `lib/regenerate-inventory-artifacts.ts`, `test/regenerate-inventory-artifacts.test.ts`
- **Failing test first:**
  - Given an existing `.migration/inventory/component-inventory.json` and a list of corrections, the orchestrator: (a) parses the draft, (b) applies corrections, (c) re-validates against `DraftInventorySchema`, (d) rewrites the JSON, (e) regenerates the review HTML, (f) returns the new artifact version.
  - If the new draft contains an entry with a generic name (`Component\d+`, `Section\d+`, or with `pX-sY` substring) the function still saves it (drafts allow this), but returns a `blockingNames: string[]` field listing offenders.
- **Implementation:** glue over Tasks 4.1, 5.2, 2.5, 2.7.
- **Commit:** `feat(inventory): regenerate inventory artifacts after chat correction`.

### Task 5.4 — Approval gate enforces semantic names

- **Files to create:** `lib/inventory-approval.ts`, `test/inventory-approval.test.ts`
- **Failing test first:**
  - Given a draft inventory that contains a generic name, `approveDraftInventory` returns `{ ok: false, reason: "blocking-names", names: [...] }` and writes nothing.
  - Given a clean draft, it writes `.migration/approvals/component-inventory.json` matching `ApprovedInventorySchema`, embedding `artifactVersion = hashArtifact(currentDraft)`.
  - Re-running `approveDraftInventory` with the same draft is idempotent (does not change `approvedAt` if no change).
- **Implementation:** uses `ApprovedInventorySchema` and `hashArtifact`.
- **Commit:** `feat(approvals): inventory approval gate rejects generic names`.

### Task 5.5 — Stale-approval invalidation

- **Files to create:** `lib/approval-staleness.ts`, `test/approval-staleness.test.ts`
- **Failing test first:**
  - Given an approved-inventory record with `artifactVersion: A`, then a regenerated draft with hash `B` (≠A), `checkApprovalStaleness` marks the approval stale (writes `staleSince` and clears its eligibility for downstream use).
  - Component-batch approvals that depend on the inventory record become recursively stale (assert via a small fixture with one component-batch approval pointing at `artifactVersion: A`).
  - Independent component-batch approvals (those whose `componentGroupIds` are unchanged across versions) remain non-stale.
- **Implementation:** read each approval JSON, compare `artifactVersion` against the live hash of the artifact it references; cascade to dependents.
- **Commit:** `feat(approvals): cascade staleness when an upstream artifact changes`.

### Task 5.6 — Chat-driven correction wiring

- **Files to modify:** [skills/migrate-continue/SKILL.md](../../skills/migrate-continue/SKILL.md), `lib/continue.ts` (rewritten in Phase 6 — see 6.1), and a new `agents/inventory-corrector.md`.
- **Failing test first:** in `test/migration-skill-contracts.test.ts`, assert that `skills/migrate-continue/SKILL.md` references natural-language corrections, not slash commands. Specifically, it must contain "describe changes in chat" and must not instruct the user to run `/migrate:discover` or `/migrate:plan` for corrections.
- **Implementation:** SKILL.md rewrite anticipated in Phase 6; for now, add the `inventory-corrector` agent prompt that takes a free-text user description and emits an `InventoryCorrection[]`.
- **Commit:** `feat(agents): inventory-corrector translates chat to correction operations`.

---

## Phase 6 — Internal scheduler and `/migrate:continue` redefined against approval state

**Goal:** `/migrate:continue` no longer hunts for the next missing `VERIFICATION.md`. It looks at approval records and the migration scheduler to decide the next action.

### Task 6.1 — Migration scheduler

- **Files to create:** `lib/migration-scheduler.ts`, `test/migration-scheduler.test.ts`
- **Failing test first:**
  - With a fresh `.migration/` (only draft inventory written), the scheduler returns `{ next: "review-inventory", artifactVersion }`.
  - With an approved (clean) inventory but no component approvals, scheduler returns `{ next: "implement-component-batch", batch: [...] }` containing 1–3 components ordered by leverage: shells first, then high-reuse, then unique.
  - With every component approved but no page approvals, scheduler returns `{ next: "assemble-page", slug: ... }` (see Phase 10).
  - With every approval done, scheduler returns `{ next: "all-done" }`.
  - When a component approval is `staleSince` set, scheduler treats it as missing.
- **Implementation:** pure function over `.migration/` state; reads through `migrationPaths`. No filesystem writes.
- **Commit:** `feat(scheduler): pick next migration action from approval state`.

### Task 6.2 — Rewrite `lib/continue.ts`

- **Files to replace:** [lib/continue.ts](../../lib/continue.ts), [test/continue.test.ts](../../test/continue.test.ts), [test/continue-discover.integration.test.ts](../../test/continue-discover.integration.test.ts) (refactor into `test/continue-inventory.integration.test.ts` for the v2 path; keep the legacy test under `test/recovery/continue-legacy.integration.test.ts` flagged as recovery in Phase 12).
- **Failing test first:**
  - Given a target with no `.migration/`, `resumeMigration` returns `{ kind: "not-initialized" }`.
  - Given a target stopped at the inventory review, `resumeMigration` returns `{ kind: "awaiting-approval", approval: "component-inventory", reviewHtmlPath }`.
  - Given an approved inventory and no component approvals, `resumeMigration` invokes the implementer for the next batch and returns `{ kind: "dispatched", action: "implement-component-batch" }`.
  - Given a stale approval, `resumeMigration` returns `{ kind: "approval-stale", approval, reason }`.
- **Implementation:** replace the phase-directory dispatcher with the scheduler-driven dispatcher.
- **Commit:** `refactor(continue): drive resume from approval state, not phase dirs`.

### Task 6.3 — Update `/migrate:continue` skill

- **Files to modify:** [skills/migrate-continue/SKILL.md](../../skills/migrate-continue/SKILL.md), [test/migration-skill-contracts.test.ts](../../test/migration-skill-contracts.test.ts)
- **Failing test first:** assert SKILL.md does not mention "phase-2-analyze", "phase-3-plan", "phase-4-extract", "phase-5-build", "phase-6-visual"; instead mentions "Component Inventory Review", "Component Batch Approval", and "Page Layout Approval".
- **Implementation:** rewrite the skill body around the four scheduler outcomes.
- **Commit:** `docs(skills): rewrite /migrate:continue around approval-driven scheduling`.

---

## Phase 7 — Storybook component batch implementation and verification

**Goal:** for a content component, generate a TSX file (semantic name only), generate a Storybook story, render the story across the three reference viewports, compare each against the corresponding Component Reference Screenshot at the 1% threshold, and emit a verification report for the user.

### Task 7.1 — Reuse `sanitizeComponentName` and add an approval-time validator

- **Files to modify:** [lib/component-tsx-emitter.ts](../../lib/component-tsx-emitter.ts), [test/component-tsx-emitter.test.ts](../../test/component-tsx-emitter.test.ts)
- **Failing test first:**
  - `it("rejects ID-like or generic names at validateApprovedName", ...)` — asserts a new exported `validateApprovedName(name)` returns `{ ok: false, reason }` for `Component3`, `p0-s0`, `Section1`, ``, `pricingCard` (lower-case), and `{ ok: true }` for `Hero`, `PricingCard`.
  - Existing `sanitizeComponentName` tests continue to pass — the function does not change behaviour.
- **Implementation:** add `validateApprovedName`. Do not modify `sanitizeComponentName` semantics; the spec wants tracking IDs to stay in metadata only, and the existing function already PascalCases without leaking IDs into filenames.
- **Commit:** `feat(codegen): validateApprovedName guards inventory approval`.

### Task 7.2 — Storybook scaffold helper *(moved to Task 3.4)*

The scaffold helper is created in Phase 3 so users get a working Storybook from the moment Migration Start finishes. No work remains here; subsequent tasks assume `target/.storybook/` exists.

### Task 7.3 — Component implementation runner

- **Files to create:** `lib/implement-component.ts`, `test/implement-component.test.ts`
- **Failing test first:**
  - Given an approved inventory entry `{ implementationName: "Hero", filePath: "src/components/Hero.tsx", sectionInstanceIds: [...] }`, the runner: (a) reads the per-section TSX captured during discovery, (b) writes `target/src/components/Hero.tsx` with a default export named `Hero`, (c) writes `target/src/components/Hero.stories.tsx` with a story per sectionInstance, (d) the story file does **not** contain any `pX-sY` strings in symbols, only in optional comments.
  - Failing rule: a snapshot test with a fixture entry must produce file content matching golden expectations. Symbol names in golden files are exclusively the semantic name.
- **Implementation:** glue over `lib/component-tsx-emitter.ts`, `lib/build.ts` section TSX picker (refactor as needed), and a small Storybook-story template.
- **Commit:** `feat(implement): codegen one approved component plus its Storybook stories`.

### Task 7.4 — Per-component verification runner

- **Files to create:** `lib/verify-component.ts`, `test/verify-component.test.ts`
- **Failing test first:**
  - Given a Storybook server stub and matching reference screenshots, `verifyComponent({ name, references })` returns `{ status: "PASS", ratios: { 390: <=0.01, 768: <=0.01, 1440: <=0.01 } }` when all viewports match; `{ status: "FAIL", failingViewports }` otherwise.
  - Reuse [scripts/lib/visual-verify-core.ts](../../scripts/lib/visual-verify-core.ts) `diffNormalizedPngs` and `assessDiffResult({ ..., maxDiffRatio: 0.01 })` exactly. No fork.
  - The test stubs Playwright by injecting a `pageFactory` so we don't actually launch a browser in unit tests.
- **Implementation:** Playwright-driven story renderer, screenshot capture per viewport, pixel-diff against the matching reference, queue-aware (Phase 8).
- **Commit:** `feat(verify): per-component visual verification at 1% threshold`.

### Task 7.5 — Component-batch orchestrator

- **Files to create:** `lib/run-component-batch.ts`, `test/run-component-batch.test.ts`
- **Failing test first:**
  - Given a scheduler-selected batch of 1–3 component groups, the orchestrator: (a) generates code via `implement-component`, (b) runs `verify-component` for each through the browser queue, (c) writes a per-batch report with Storybook URLs / reference paths / diff paths, (d) does **not** create any approval record.
  - When verification fails for a content component, the orchestrator surfaces the failing viewports without aborting the batch (other components in the batch may still pass).
  - Shared shells follow a different code path: implementation runs, but visual diff is skipped per the spec; the report records `kind: "shell", verification: "skipped-by-design"`.
- **Commit:** `feat(scheduler): run a component batch end-to-end excluding approval`.

---

## Phase 8 — Browser work queue with default concurrency 1

**Goal:** every browser-bound task (screenshot capture, story rendering, page assembly screenshot, baseline regression) goes through one shared queue with default concurrency 1.

### Task 8.1 — `BrowserWorkQueue` class

- **Files to create:** `lib/browser-work-queue.ts`, `test/browser-work-queue.test.ts`
- **Failing test first:**
  - With `concurrency: 1`, two enqueued jobs run sequentially (assert via a counter that never exceeds 1).
  - With `concurrency: 2`, two enqueued jobs may overlap (assert peak counter equals 2).
  - Jobs that throw propagate the error to the caller; the queue continues processing later jobs.
  - The queue exposes `setConcurrency(n)` for chat-driven configuration; values outside `[1, 4]` are rejected.
- **Implementation:** small async-FIFO with `pending` counter. No external deps.
- **Commit:** `feat(queue): browser work queue with default concurrency 1`.

### Task 8.2 — Wire the queue through every browser caller

- **Status:** Done.
- **Files to modify:** `lib/discovery-v2.ts` (Task 3.1), `lib/verify-component.ts` (Task 7.4), and the future page-assembly verifier (Phase 10), plus `lib/run-component-batch.ts`.
- **Failing test first:**
  - Each caller test asserts the call goes through a queue instance passed by dependency injection. Default queue concurrency is 1.
  - `BrowserWorkQueue.from({ targetDir })` reads concurrency from `.migration/config/queue.json` if present, otherwise defaults to 1.
- **Commit:** `refactor(queue): route every browser-bound task through BrowserWorkQueue`.

### Task 8.3 — Persisted queue config

- **Files to create:** `schemas/queue-config.ts`, `lib/queue-config.ts`, `test/queue-config.test.ts`
- **Failing test first:**
  - `loadQueueConfig` returns `{ concurrency: 1 }` by default; respects `.migration/config/queue.json` when present.
  - `setQueueConcurrency(n)` writes the config and rejects invalid `n`.
- **Implementation:** schema + IO; tied to chat-driven natural-language change ("set browser concurrency to 2") via the inventory-corrector pattern (or a sibling agent).
- **Commit:** `feat(queue): persisted concurrency configuration`.

---

## Phase 9 — Approved migrated baselines and 0.1% regression checks

**Goal:** when the user approves a component batch, capture a baseline screenshot set; later refinements run a 0.1%-threshold regression diff against those baselines.

### Task 9.1 — Approve-component-batch action

- **Status:** Done.
- **Files to create:** `lib/approve-component-batch.ts`, `test/approve-component-batch.test.ts`
- **Failing test first:**
  - Given a batch report and a positive user approval, the action: (a) writes `.migration/approvals/components/<componentGroupId>.json` matching `ComponentBatchApprovalSchema`, (b) captures Storybook screenshots for each approved component at 390/768/1440 and writes them to `.migration/baselines/components/<implementationName>-<viewport>.png`, (c) writes the matching `ApprovedBaseline` JSON with `regressionThreshold: 0.001`.
  - Approving a stale component batch (its referenced inventory artifact has changed) is rejected with `reason: "stale-upstream"`.
- **Commit:** `feat(approvals): record component-batch approval and capture baseline`.

### Task 9.2 — Regression check runner

- **Status:** Done.
- **Files to create:** `lib/check-component-regression.ts`, `test/check-component-regression.test.ts`
- **Failing test first:**
  - Given an approved baseline and the current Storybook render, `checkComponentRegression` calls `assessDiffResult({ maxDiffRatio: 0.001, ... })` and returns `{ status: "PASS" | "FAIL", failingViewports }`.
  - On regression, the function returns the diff PNG path; it does **not** auto-update the baseline. Updating the baseline requires a fresh approval.
- **Implementation:** thin wrapper over `verify-component`, with the tighter threshold and the baseline as the reference instead of the source screenshot.
- **Commit:** `feat(verify): regression check at 0.1% against approved baseline`.

---

## Phase 10 — Page layout assembly from approved components, 2% full-page threshold

**Goal:** for any page whose required components are all approved, assemble the page from approved components, capture a full-page screenshot, and diff against the source page reference at 2%.

### Task 10.1 — Page-assembly planner

- **Status:** Done.
- **Files to create:** `lib/page-assembly-planner.ts`, `test/page-assembly-planner.test.ts`
- **Failing test first:**
  - Given the approved inventory and discovered page sections, the planner outputs an ordered list of components per page slug, marking shells first.
  - Pages whose required components are not all approved are skipped (`pendingApproval` array).
- **Commit:** `feat(scheduler): plan page assembly from approved components`.

### Task 10.2 — Page-assembly runner

- **Files to create:** `lib/run-page-assembly.ts`, `test/run-page-assembly.test.ts`. Reuse [lib/page-assembler.ts](../../lib/page-assembler.ts) where possible.
- **Failing test first:**
  - For a page with three approved components, the runner: (a) writes `target/src/app/<slug>/page.tsx` composing the three components, (b) builds the project (assert this is queued behind the existing build runner), (c) captures a full-page screenshot per viewport via the browser queue, (d) calls `assessDiffResult({ maxDiffRatio: 0.02, ... })` against the source page reference, (e) writes a per-page report (no approval).
  - Shared shells appearing in the page are validated **in context** — the page-level diff is the only check; isolated shell verification is skipped (per spec §3.2).
- **Commit:** `feat(page): assemble page from approved components and verify at 2%`.

### Task 10.3 — Approve-page-layout action

- **Files to create:** `lib/approve-page-layout.ts`, `test/approve-page-layout.test.ts`
- **Failing test first:**
  - Given a page report and positive approval, the action: (a) writes `.migration/approvals/pages/<slug>.json` per `PageLayoutApprovalSchema`, (b) captures full-page baselines per viewport, (c) writes matching `ApprovedBaseline` JSON.
  - Approving a page whose components went stale is rejected.
- **Commit:** `feat(approvals): record page-layout approval and capture page baseline`.

---

## Phase 11 — Reduced command surface

**Goal:** user-visible slash commands are exactly `/migrate:new`, `/migrate:continue`, `/migrate:status`, `/migrate:help`. Everything else is gone or hidden as recovery.

### Task 11.1 — Delete user-visible legacy commands

- **Files to delete:** [commands/migrate-config.md](../../commands/migrate-config.md), [commands/migrate-discover.md](../../commands/migrate-discover.md), [commands/migrate-analyze.md](../../commands/migrate-analyze.md), [commands/migrate-plan.md](../../commands/migrate-plan.md), [commands/migrate-extract.md](../../commands/migrate-extract.md), [commands/migrate-build.md](../../commands/migrate-build.md), [commands/migrate-polish.md](../../commands/migrate-polish.md), [commands/migrate-verify.md](../../commands/migrate-verify.md). Skill directories under [skills/](../../skills/) follow the same fate **except** for `migrate-status`, `migrate-help`, `migrate-new`, `migrate-continue`.
- **Files to modify:** [plugin.json](../../plugin.json) so its `commands` and `skills` references list only the four user-visible names.
- **Failing test first:**
  - In `test/migration-skill-contracts.test.ts`, list the only allowed user-visible command files and assert the `commands/` directory contains exactly that set.
  - Add a test that `plugin.json`'s registered commands list contains exactly the four allowed names.
- **Implementation:** delete files and update manifest. Keep `lib/discover.ts`, `lib/analyze.ts`, `lib/plan.ts`, `lib/extract.ts`, `lib/build.ts`, `lib/polish.ts` for recovery (Phase 12).
- **Commit:** `chore(plugin): user surface limited to /migrate:new, :continue, :status, :help`.

### Task 11.2 — `/migrate:status` reflects approval state

- **Files to modify:** [skills/migrate-status/SKILL.md](../../skills/migrate-status/SKILL.md), [lib/status.ts](../../lib/status.ts), [test/status.test.ts](../../test/status.test.ts)
- **Failing test first:**
  - `getStatus` returns `{ initialized, sourceUrl, draftInventory: { revision, hash, blockingNames }, approvals: { inventory: "approved" | "draft" | "stale", components: [...], pages: [...] }, queueConcurrency }` — explicitly no `mode`/`goal`.
- **Implementation:** rewrite `getStatus`; remove dead `completedPhases` field. Update SKILL.md to print the new shape, including the optional concurrency line.
- **Commit:** `refactor(status): summarise migration via approvals, not phases`.

### Task 11.3 — `/migrate:help` rewrite

- **Files to modify:** [skills/migrate-help/SKILL.md](../../skills/migrate-help/SKILL.md), [test/migrate-help-skill.test.ts](../../test/migrate-help-skill.test.ts)
- **Failing test first:**
  - Help text contains exactly the four user-visible commands and a single-paragraph workflow summary; does not mention any explicit phase command.
  - A "Recovery" section exists at the bottom and clearly states that lower-level scripts are advanced/recovery tools and not part of the normal flow.
- **Commit:** `docs(help): rewrite for the four-command guided flow`.

---

## Phase 12 — Keep lower-level scripts and library entry points as recovery tools

**Goal:** `lib/discover.ts`, `lib/analyze.ts`, `lib/plan.ts`, `lib/extract.ts`, `lib/build.ts`, `lib/polish.ts`, `scripts/*.ts` remain runnable. They keep their existing tests. They are not slash commands.

### Task 12.1 — Mark recovery entry points

- **Files to modify:** the head comment of each `lib/<phase>.ts`, plus a new doc `docs/recovery/README.md` (note: under `docs/`, but spec & ADRs section already lives in `docs/`; add an ADR if architectural).
- **Failing test first:**
  - A new `test/recovery-entrypoints.test.ts` asserts that each of `lib/discover.ts`, `lib/analyze.ts`, `lib/plan.ts`, `lib/extract.ts`, `lib/build.ts`, `lib/polish.ts` still exposes a CLI entry (`if (import.meta.url === ...)`) and exits non-zero when called without arguments.
  - The same test asserts these files are not referenced from `commands/` (string-search assertion).
- **Implementation:** doc-only changes plus a brief "RECOVERY USE ONLY" header in each file.
- **Commit:** `docs(recovery): label legacy phase libs as recovery-only entry points`.

### Task 12.2 — Recovery-flagged integration tests

- **Files to modify/move:** integration tests that exercise the legacy phase dispatchers (`test/continue-discover.integration.test.ts`, `test/continue-analyze.integration.test.ts`, etc.) — leave under `test/` but add a top-level `describe.skip` toggle behind `process.env.RECOVERY_TESTS === "1"`. Document the toggle in the recovery README.
- **Failing test first:** add a test asserting the active-by-default suite finishes faster than the previous baseline (sanity); the recovery suite gets opt-in execution only.
- **Commit:** `test(recovery): gate legacy phase dispatcher tests behind RECOVERY_TESTS`.

---

## Cross-cutting changes (touch each phase as needed)

- `knowledge/phase-pitfalls/` — rename to `knowledge/checkpoint-pitfalls/` with three files: `inventory.md`, `component-batch.md`, `page-layout.md`. Old files move to `knowledge/recovery/` for reference.
- `hooks/session-start.js` — no change required by this plan.
- `agents/` — keep `phase-executor.md`, `phase-verifier.md`, `state-repairer.md` as recovery agents. Add `inventory-corrector.md` (Task 5.6). Mark deprecated agents in their headers.
- `.ai/memory/architecture.md` — update once the spec lands; not in code path.

---

## Verification gates

End-to-end verification at the close of each phase:

1. **Phase 1** — `pnpm test && pnpm typecheck` green; manually open `skills/migrate-new/SKILL.md` and confirm the wizard is three questions.
2. **Phase 2** — `pnpm test -- schemas` and `pnpm test -- artifact-hash` and `pnpm test -- migration-paths` all green.
3. **Phase 3** — drive `tsx lib/migration-start.ts --target /tmp/sample --url https://example.com` against a vendored fixture HTTP server (use the test's `getPort()` pattern); confirm `.migration/inventory/component-inventory.json` and `inventory-review.html` appear and validate.
4. **Phase 4** — open the generated `inventory-review.html` in a browser; click viewport toggles, click reveal-hidden, click source links. Confirm visual layout.
5. **Phase 5** — run a `tsx` one-liner that calls `applyCorrections` with a `rename` op; confirm the JSON revision bumps and the artifact hash changes.
6. **Phase 6** — `pnpm test -- migration-scheduler && pnpm test -- continue` green.
7. **Phase 7** — full integration test: inventory approval → batch implementation → Storybook story renders → verify-component reports PASS for at least one fixture component.
8. **Phase 8** — concurrency test asserts no two browser jobs overlap when concurrency is 1.
9. **Phase 9** — regression test: capture baseline → tweak the rendered output → verify the regression check fires at 0.1%.
10. **Phase 10** — full integration test: page layout assembly produces a screenshot diff result at 2%.
11. **Phase 11** — `pnpm test -- migration-skill-contracts` enforces the four-command surface; manual smoke: `/migrate:help` shows only those commands.
12. **Phase 12** — `RECOVERY_TESTS=1 pnpm test` runs the recovery suite green.

Final whole-suite gate before merge: `pnpm test && pnpm typecheck`.

---

## Out of scope

- Visual masking of dynamic regions (deferred per spec §7).
- Phase 7 Animate / Phase 8 Perf — neither was implemented before this plan and is not part of this redesign.
- Multi-target / monorepo layouts.
- Auto-update of approved baselines on minor pixel drift.
- Any non-English UI strings.

---

## Decisions confirmed (2026-05-07)

1. Review HTML path: `.migration/inventory/inventory-review.html` (sibling of the JSON). Image `src` is relative to that location.
2. `mode`/`goal` are removed outright in v1. No deprecation path. Existing `.migration/` directories are not preserved.
3. Storybook scaffold runs eagerly during Migration Start (Task 3.4 / 3.5), not lazily before the first batch.
