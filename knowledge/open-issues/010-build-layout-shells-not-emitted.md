# ISSUE-010: Phase 5 build emits `app/layout.tsx` referencing Header/Footer components that were never written to disk

**Surfaced by:** Phase 5 (Build)
**Severity:** Critical — when `library/layouts.json` has any non-null slot (header/footer/nav), the generated `app/layout.tsx` imports `@/components/Header`, `@/components/Footer`, `@/components/Nav` — but the orchestrator only emits component files for entries in `library/components.json`, which by design EXCLUDES layout shells. `next build` fails with "Module not found: Can't resolve '@/components/Header'" or compiles a layout that crashes at render with `Header is not defined`.
**Status:** Patched 2026-05-05 — `lib/build.ts` now loads `phase-2-analyze/analysis/sections.json` as a precondition and emits a Header.tsx / Footer.tsx / Nav.tsx file for each populated layout slot, resolving the section TSX via `tagSkeleton` match against `appearsOn[0]`'s sections. Gate criterion #2 updated to compare emitted-component-ids against `components.json` ID set so layout entries don't inflate the count. Integration test in `test/build.test.ts` ("emits Header.tsx for a populated layout shell...") exercises the path.

## Evidence pattern

After running `migrate:build`:
- `<target>/src/app/layout.tsx` exists, imports `Header` and `Footer`
- `<target>/src/components/` lists 11 (or whatever N) component files — none named `Header.tsx` or `Footer.tsx`
- `manifest.json` `components` array length matches `library/components.json` length, NOT including the layout slots

## Root cause

`lib/analyze.ts` `extractComponents` deliberately excludes layout cluster IDs from `components.json`:

```ts
const layoutIds = new Set([layouts.header?.id, layouts.footer?.id, layouts.nav?.id].filter(Boolean));
return clusters.filter(c => !layoutIds.has(c.id)).map(c => { ... });
```

Layouts are written to a separate `library/layouts.json` with the `LayoutShell` shape:

```ts
{ id, signature, appearsOn: string[], tagSkeleton }
```

`lib/build.ts` then iterates `components.json` to emit TSX files. Layout shells are never iterated. When `assembleRootLayoutTsx` looks up the layout shell ID in `planComponentFiles({ components })`, it finds nothing and falls back to the literal names `"Header"`, `"Footer"`, `"Nav"`:

```ts
header: layoutsResult.data.header
  ? { componentName: planComponentFiles({ components }).find(p => p.id === layoutsResult.data.header!.id)?.name ?? "Header" }
  : null,
```

The fallback is ALWAYS taken because the layout shell ID is never in components. The layout TSX imports `Header`/`Footer`/`Nav` — files that were never written. `next build` fails on the missing module.

## Why the test suite missed it

`test/build.test.ts` writes a `layouts.json` with all three slots set to `null`:

```ts
writeFileSync(join(lib, "layouts.json"), JSON.stringify({ header: null, footer: null, nav: null, updatedAt: now }));
```

`assembleRootLayoutTsx` returns `null` when all slots are null, so no `app/layout.tsx` is overwritten and no Header/Footer imports are emitted. The path that triggers this bug is never exercised.

## Proposed fix

The orchestrator must emit component files for layout shells too. Each shell carries enough metadata (`appearsOn`, `tagSkeleton`) to locate the corresponding section TSX in `pages/<slug>/generated/`.

### Step 1 — Load `phase-2-analyze/analysis/sections.json`

`build.ts` already uses `sections.json` patterns from `extract.ts`. Add `loadSections` import and load the file once. The data shape (`pages: { url, sections: { tagSkeleton, ... }[] }[]`) lets the orchestrator find the section index whose `tagSkeleton` matches the shell's `tagSkeleton`.

### Step 2 — For each non-null layout slot, emit a component file

```ts
const SLOT_NAMES = { header: "Header", footer: "Footer", nav: "Nav" } as const;

for (const slot of ["header", "footer", "nav"] as const) {
  const shell = layoutsResult.data[slot];
  if (!shell) continue;

  const lookupUrl = shell.appearsOn[0];
  const slug = slugByUrl.get(lookupUrl);
  if (!slug) continue;

  const pageSections = sectionsResult.data.pages.find(p => p.url === lookupUrl);
  if (!pageSections) continue;

  const sectionIdx = pageSections.sections.findIndex(s => s.tagSkeleton === shell.tagSkeleton);
  if (sectionIdx < 0) continue;

  const generatedDir = join(pagesDir, slug, "generated");
  const sectionTsx = pickSectionTsxForMember({
    generatedDir,
    sectionId: `pX-s${sectionIdx}`,  // only the index after `-s` is used
  });
  if (!sectionTsx) continue;

  const name = SLOT_NAMES[slot];
  const dest = join(args.targetDir, "src/components", `${name}.tsx`);
  writeFileSync(dest, transformOrWrap(sectionTsx, name));
  componentEntries.push({ id: shell.id, name, filePath: `src/components/${name}.tsx`, memberCount: shell.appearsOn.length });
}
```

### Step 3 — Adjust gate counts

Gate criterion #2 is "every component in components.json was emitted". With layouts now also emitted, the comparison `componentEntries.length === components.length` is still correct — layouts add EXTRA entries on top, never reducing the count for components.

### Alternative — change the layout assembler to use sanitized names

Rather than hardcoding `"Header"`/`"Footer"`/`"Nav"`, the assembler could derive a name from `shell.tagSkeleton` (e.g., the first tag) or accept an explicit name from the orchestrator. Either way, the orchestrator must emit a file at the chosen name. The hardcoded fallback path is the simplest fix and matches what `assembleRootLayoutTsx` already imports.

## Reproduction

1. Run a migration where `extractLayouts` matched a header/footer (any site with `<header>` or `<footer>` consistent across pages — most CMSes)
2. After Phase 5: `ls <target>/src/components/` — no `Header.tsx`/`Footer.tsx`
3. `cat <target>/src/app/layout.tsx` — imports `@/components/Header`
4. `cd <target> && npx next build` fails on the missing module

## Action items

- [ ] Add `loadSections` import to `lib/build.ts`; load `phase-2-analyze/analysis/sections.json` near the other preconditions
- [ ] After the components emission loop, add a layout-shell emission loop that resolves each populated slot to a section TSX via tagSkeleton match
- [ ] Use the same `transformOrWrap` pipeline (strip comments, escape `<`, inject Next.js imports, wrap)
- [ ] Append layout entries to `manifest.components` so the manifest reflects what landed on disk
- [ ] Update `test/build.test.ts` with a NEW test case: `layouts.json` has a non-null `header` slot whose tagSkeleton matches a section in `sections.json`. Assert `<target>/src/components/Header.tsx` exists after `runBuild`. Assert the manifest's components array contains the layout entry.
- [ ] Document the layout-emission flow as a new pitfall in `knowledge/phase-pitfalls/build.md`
- [ ] Consider longer-term: stop hardcoding `"Header"`/`"Footer"`/`"Nav"` in `assembleRootLayoutTsx` and accept names from the orchestrator. Defer.
