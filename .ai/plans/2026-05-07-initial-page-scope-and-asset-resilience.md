# Initial Page Scope And Asset Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask for target pages during `/migrate:new` and prevent Phase 5 from emitting unbacked image paths when Phase 4 image extraction is partially degraded.

**Architecture:** Store the user's initial page intent in `SITE.md` as `initialPageSelection`, then have Phase 1 normalize and apply that selection before probing. Make image extraction write a manifest even when individual downloads fail, recording failures in `failedDownloads`. Make JSX generation fail loudly when it cannot map a source image to an extracted local asset instead of emitting `/images/homepage/...`.

**Tech Stack:** TypeScript, Zod, gray-matter frontmatter, Vitest, existing plugin skills and scripts.

---

## File Structure

- `schemas/site.ts` owns the new `initialPageSelection` contract.
- `lib/new-migration.ts` passes CLI/wizard page selection into bootstrap.
- `lib/bootstrap.ts` records run scope text from `initialPageSelection`.
- `lib/discover.ts` applies `initialPageSelection` unless an explicit `--include-urls` override is supplied.
- `skills/migrate-new/SKILL.md`, `docs/specs/2026-04-21-migration-plugin-design.md`, and `agents/site-crawler.md` document the first-question and Phase 1 behavior.
- `scripts/lib/extract-images-core.ts` records per-image download failures in the manifest while continuing.
- `scripts/generate-jsx.ts` exports testable generation helpers and fails on missing/unmatched image mappings.
- `lib/extract-runner.ts` salvages staged image manifests even if the image subprocess rejects.
- `scripts/verify-build-baseline.ts` fails when rendered local images are broken.
- Tests stay focused in `test/new-migration.test.ts`, `test/discover.test.ts`, `test/migration-skill-contracts.test.ts`, `test/extract-images-core.test.ts`, `test/extract-runner.test.ts`, `test/generate-jsx.test.ts`, and `test/image-health.test.ts`.

### Task 1: Initial Page Selection Contract

**Files:**
- Modify: `schemas/site.ts`
- Modify: `lib/new-migration.ts`
- Modify: `lib/bootstrap.ts`
- Test: `test/new-migration.test.ts`
- Test: `test/discover.test.ts`

- [x] **Step 1: Write failing tests**

Add a `runNewMigration` test that passes `initialPageSelection: ["/", "/about"]` and expects `SITE.md` to contain `initialPageSelection: ["/","/about"]` plus `RUN.md` to describe selected pages. Add a `runDiscover` test using an unattended site with `initialPageSelection: ["/about"]`; after discovery, `crawl.json` and `probe.json` should contain only the normalized `/about` URL.

- [x] **Step 2: Run tests to verify red**

Run:

```bash
pnpm test test/new-migration.test.ts test/discover.test.ts
```

Expected: failures because `initialPageSelection` is not accepted or applied yet.

- [x] **Step 3: Implement minimal contract**

Add `initialPageSelection: z.array(z.string().min(1)).default(["all"])` to `SiteFrontmatterSchema`. Add `initialPageSelection?: string[]` to `NewMigrationArgs`, pass it into the schema parse, and parse `--initial-page-selection` as comma-separated values. In `bootstrapMigration`, set `RUN.md` scope to either `all discovered pages from ${sourceUrl}` or `selected pages from ${sourceUrl}: ${entries.join(", ")}`.

- [x] **Step 4: Apply selection in discover**

In `lib/discover.ts`, load `initialPageSelection` from `SITE.md`, normalize entries with `new URL(entry, sourceUrl).href` unless the value is `all`, and use that as the filter when `args.includeUrls` is not supplied. Preserve explicit `--include-urls` behavior as the stronger override.

- [x] **Step 5: Run focused tests**

Run:

```bash
pnpm test test/new-migration.test.ts test/discover.test.ts
```

Expected: both tests pass.

### Task 2: First-Question Documentation And Skill Contract

**Files:**
- Modify: `skills/migrate-new/SKILL.md`
- Modify: `agents/site-crawler.md`
- Modify: `docs/specs/2026-04-21-migration-plugin-design.md`
- Test: `test/migration-skill-contracts.test.ts`

- [x] **Step 1: Write failing contract test**

Add a skill-contract test asserting `migrate-new` asks a page-selection question before goal/mode, invokes `lib/new-migration.ts` with `--initial-page-selection`, and no longer says there are only four wizard questions.

- [x] **Step 2: Run test to verify red**

Run:

```bash
pnpm test test/migration-skill-contracts.test.ts
```

Expected: failure because the skill still documents four questions and no page-selection flag.

- [x] **Step 3: Update contracts**

Change `/migrate:new` to five skippable questions:

1. target directory
2. source code access
3. pages to migrate: `all` or comma-separated full URLs/paths, default `all`
4. goal
5. mode

Document that the entry script receives `--initial-page-selection "${INITIAL_PAGE_SELECTION}"`. Update the spec wizard block and `SITE.md` schema example. Update `site-crawler` to say an existing `initialPageSelection` is already applied by the first discover pass, and the attended post-crawl list is a refinement/confirmation gate.

- [x] **Step 4: Run focused contract test**

Run:

```bash
pnpm test test/migration-skill-contracts.test.ts
```

Expected: pass.

### Task 3: Resilient Image Manifest Writing

**Files:**
- Modify: `scripts/lib/extract-images-core.ts`
- Test: `test/extract-images-core.test.ts`

- [x] **Step 1: Write failing test**

Add a `writeImageOutput` test that supplies two images and injects a downloader that throws for one URL. Expect `image-manifest.json` to exist and include:

```json
"failedDownloads": [{ "url": "https://example.com/missing.png", "localPath": "images/example.com/page/01-hero/missing.png" }]
```

Also expect the successful image file to exist.

- [x] **Step 2: Run test to verify red**

Run:

```bash
pnpm test test/extract-images-core.test.ts
```

Expected: failure because `writeImageOutput` has no injectable downloader and writes no `failedDownloads`.

- [x] **Step 3: Implement resilient output**

Add a `FailedImageDownload` interface and optional fourth parameter:

```ts
export interface WriteImageOutputDeps {
  downloadFile?: (url: string, dest: string) => Promise<void>;
}
```

Use `deps.downloadFile ?? downloadFile`, collect `{ url, localPath, error }` records on failures, continue to inline SVG writes, and include `failedDownloads` in `image-manifest.json`.

- [x] **Step 4: Run focused test**

Run:

```bash
pnpm test test/extract-images-core.test.ts
```

Expected: pass.

### Task 4: Fail-Fast JSX Image Mapping

**Files:**
- Modify: `scripts/generate-jsx.ts`
- Create: `test/generate-jsx.test.ts`

- [x] **Step 1: Write failing tests**

Create tests for:

- `generateJsx` rejects when a structure contains an `<img>` and neither `image-manifest.json` nor `images.json` exists.
- `generateJsx` maps a CDN URL to the `localPath` from `image-manifest.json` and does not emit `/images/homepage/`.

- [x] **Step 2: Run test to verify red**

Run:

```bash
pnpm test test/generate-jsx.test.ts
```

Expected: failure because `scripts/generate-jsx.ts` is not import-safe/testable and still falls back to `/images/homepage/`.

- [x] **Step 3: Implement testable fail-fast generator**

Export `generateJsx(args)`, guard CLI execution with `if (import.meta.url === \`file://${process.argv[1]}\`)`, and change `mapToLocalImage` to throw a clear error when the manifest is missing or no image entry matches. Keep existing image-manifest-over-images precedence.

- [x] **Step 4: Run focused test**

Run:

```bash
pnpm test test/generate-jsx.test.ts
```

Expected: pass.

### Task 5: Additional Confirmed Phase 5 Issue Fixes

**Files:**
- Modify: `scripts/lib/extract-images-core.ts`
- Modify: `lib/extract-runner.ts`
- Modify: `scripts/extract-images.ts`
- Modify: `scripts/verify-build-baseline.ts`
- Create: `scripts/lib/image-health.ts`
- Test: `test/extract-images-core.test.ts`
- Test: `test/extract-runner.test.ts`
- Test: `test/image-health.test.ts`

- [x] **Step 1: Add CSS URL parsing regression**

Add coverage for `url("https://...%20(1).webp")` so valid Webflow background image URLs with parentheses are preserved.

- [x] **Step 2: Salvage staged image manifests**

Add `moveStagedImageOutputs(stagingDir, outputDir)` and call it in the default image runner's `finally` block so partial `image-manifest.json` output is not stranded after a subprocess failure.

- [x] **Step 3: Make fatal image extraction errors visible**

Change `scripts/extract-images.ts` to exit non-zero from `main().catch(...)`. Recoverable per-asset failures stay in `failedDownloads[]`; real script failures surface to the runner.

- [x] **Step 4: Add rendered broken-image gate**

Add `summarizeBrokenImages` and have `verify-build-baseline.ts` fail if the local rendered DOM contains visible broken images.

### Task 6: Verification And Memory

**Files:**
- Modify: `.ai/plans/2026-05-07-initial-page-scope-and-asset-resilience.md`
- Modify: `.ai/memory/lessons.md` only if a non-obvious maintainer pitfall was found.

- [x] **Step 1: Run affected tests**

Run:

```bash
pnpm test test/new-migration.test.ts test/discover.test.ts test/migration-skill-contracts.test.ts test/extract-images-core.test.ts test/extract-runner.test.ts test/generate-jsx.test.ts test/image-health.test.ts test/session-log.test.ts
```

Expected: pass.

- [x] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: pass.

- [x] **Step 3: Update plan checkboxes**

Mark completed steps in this plan after the commands pass.

Fresh verification completed:

```bash
pnpm test
# 78 files, 308 tests passed

pnpm typecheck
# passed
```
