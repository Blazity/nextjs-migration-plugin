# ISSUE-005: extract-runner spec file contract mismatch — manifest claims files that scripts never write

**Surfaced by:** Phase 4 (Extract)
**Severity:** Critical — `component-usage.json` is never written for any page → Phase 4 verification gate criterion #4 ("every component-usage.json references known components") fails for 100% of pages. `manifest.json` also reports false `files.*` paths.
**Status:** Open

## Evidence pattern

After `migrate:extract` completes:
- `pages/<slug>/spec/` contains only per-section sidecars (`NN-<label>.styles.json`, `NN-<label>.structure.md`) plus `00-globals.json`, `images.json` (when extract-images succeeded), and `structure-1440x900.md`
- `pages/<slug>/component-usage.json` does NOT exist for any page
- `pages/<slug>/manifest.json` declares `files.styles = "spec/styles.json"`, `files.animations = "spec/animations.json"`, `files.structure = "spec/structure.json"` — none of those files exist
- `manifest.json` reports `stats.sectionCount = 0` for every page even when section sidecars are present

`/migrate:extract` returns "Phase 4 verification failed" with criterion #4 listing every page in `routes.json`.

## Root cause

Three layers of contract drift between extract scripts and the orchestrator.

### Layer 1 — extract-styles writes per-section, never unified

`scripts/lib/extract-styles-core.ts:944` writes:

```ts
const stylesFile = `${paddedIndex}-${section.label}.styles.json`
```

Each section produces its own JSON sidecar in `spec/`. There is **no unified `spec/styles.json`** ever written. Same pattern for structure (`NN-<label>.structure.md`). Only `images.json` (renamed from staging by `extract-runner.ts:138`) and `00-globals.json` ever exist as unified spec-root files.

Downstream Phase 5 consumers (`scripts/generate-jsx.ts:202`, `scripts/generate-class-patches.ts:153`) ALSO read per-section sidecars. The per-section format is the de facto contract used by all real consumers.

### Layer 2 — manifest schema lies

`schemas/page-spec.ts:3-9` declares:

```ts
export const PageSpecFilesSchema = z.object({
  styles: z.string(),
  images: z.string(),
  animations: z.string(),
  structure: z.string(),
  globals: z.string(),
});
```

`lib/extract-runner.ts:73-79` populates this with hardcoded paths regardless of what was actually produced:

```ts
files: {
  styles: "spec/styles.json",
  images: "spec/images.json",
  animations: "spec/animations.json",
  structure: "spec/structure.json",
  globals: "spec/00-globals.json",
},
```

The Zod schema accepts any string, so validation passes even though four of five paths are fictional.

### Layer 3 — orchestrator reads the fiction, silently no-ops

`lib/extract.ts:104-123` builds component-usage from a non-existent file:

```ts
const stylesPath = join(pagesDir, slug, "spec/styles.json");
if (existsSync(stylesPath)) {
  const styles = JSON.parse(readFileSync(stylesPath, "utf8"));
  // ... build component-usage ...
  writeFileSync(join(pagesDir, slug, "component-usage.json"), ...);
}
```

`existsSync` returns `false` for every page → `buildComponentUsage` never runs → `component-usage.json` never written. Silent no-op, no error logged.

`lib/extract-runner.ts:99-118` (`readStats`) has the same bug: reads `styles.json` for `sectionCount`, returns 0 because the file doesn't exist. Same for `animations.json` (when extract-animations errors — see ISSUE-006).

## Why this didn't fire in tests

`test/extract-runner.test.ts:14-25` and `test/extract.test.ts` use stubs that DO write the unified files:

```ts
const stubStyles = async ({ outputDir }) => {
  writeFileSync(join(outputDir, "styles.json"), JSON.stringify({ sections: [{}, {}, {}] }));
  // ...
};
```

The stubs satisfy the orchestrator's read contract. The real subprocess does NOT. Test stubs are decoupled from the production write format — the contract was never co-validated.

## Proposed fix

Pick one. Both work; (B) is closer to the existing downstream code and avoids re-marshalling section data twice.

### Option A — Aggregate per-section files into unified `styles.json` after extract-styles step

Wrap `defaultRunStyles` in `lib/extract-runner.ts` to scan `outputDir` for `*.styles.json` after the subprocess returns and write a unified `styles.json`:

```ts
const defaultRunStyles: ExtractStep = async (args) => {
  // ... existing execFile call ...
  const sectionFiles = readdirSync(args.outputDir)
    .filter(f => /^\d+-.*\.styles\.json$/.test(f))
    .sort();
  const sections = sectionFiles.map(f => JSON.parse(readFileSync(join(args.outputDir, f), "utf8")));
  writeFileSync(join(args.outputDir, "styles.json"), JSON.stringify({ sections }, null, 2));
};
```

Same approach for `structure.json` (read all `*.structure.md`, embed into a structure index — though the consumers don't actually need this; consider dropping it from the schema instead).

### Option B — Change the orchestrator and stats reader to consume per-section files directly

Change `lib/extract.ts:104-123` and `lib/extract-runner.ts:99-118` to scan `pages/<slug>/spec/` for `*.styles.json` sidecars. Update `buildComponentUsage` input to take a section list assembled by the orchestrator. Update `manifest.files.styles` to be either an array of paths or an empty string indicating "see per-section sidecars".

This requires updating `schemas/page-spec.ts` `PageSpecFilesSchema` (string → string[] for styles/structure, or document the convention).

### Option C — Hybrid: keep schema, drop unused fields

Drop `structure` from `PageSpecFilesSchema` since no downstream code reads `spec/structure.json`. Aggregate only `styles.json` (Option A). Keep `images.json`, `animations.json`, `00-globals.json` as-is (they already exist as unified files, modulo ISSUE-006).

Recommendation: **Option A** for the styles aggregation (smallest blast radius — fixes the actual bug), drop the dead `structure.json` claim from the schema (Option C add-on), and align the test stubs to the real production output format afterward so this can never silently re-drift.

## Action items

- [ ] Patch `lib/extract-runner.ts` `defaultRunStyles` to aggregate per-section `*.styles.json` sidecars into `spec/styles.json` after the subprocess completes
- [ ] Drop `structure: z.string()` from `PageSpecFilesSchema` in `schemas/page-spec.ts` (no consumer reads it; per-section `*.structure.md` is the contract)
- [ ] Update `manifest.files.structure` references and the test stubs in `test/extract-runner.test.ts` and `test/extract.test.ts` to match the new shape
- [ ] Update `lib/extract.ts:104-123` to handle both legacy and aggregated layouts (graceful migration), or simply require Option A's aggregator to run before the component-usage step
- [ ] Add a regression test where `extractPage` is invoked with a stub that writes ONLY per-section files and asserts the orchestrator subsequently produces `component-usage.json` and a non-zero `sectionCount` in stats
- [ ] Document the aggregation step in `knowledge/phase-pitfalls/extract.md`
