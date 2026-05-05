# ISSUE-007: Phase 5 build emits 0 components — extension mismatch between codegen output and orchestrator filter

**Surfaced by:** Phase 5 (Build)
**Severity:** Critical — gate criterion #2 ("every component in components.json was emitted") fails for 100% of components on every Phase 5 run. Phase 5 cannot pass on any real project until this is fixed.
**Status:** Open

## Evidence pattern

After running `migrate:build`:
- `<target>/src/components/` is empty (or contains only stale files from previous runs)
- `phase-5-build/build/manifest.json` lists `components: []`
- `verification.json` shows `every component in components.json was emitted: false`
- VERIFICATION.md is NOT written
- `pages/<slug>/generated/` contains files like `01-navbar-component.generated.jsx`, `02-hero.generated.jsx`, etc. — codegen DID run, output DID land

The codegen subprocess succeeded and produced files. The orchestrator just couldn't find them.

## Root cause

`scripts/generate-jsx.ts` line 220 writes per-section files with the `.generated.jsx` extension:

```ts
const outputFile = `${label}.generated.jsx`
```

`lib/build.ts` line 196 filters for files ending in `.tsx`:

```ts
const tsxFiles = readdirSync(args.generatedDir).filter(f => f.endsWith(".tsx")).sort();
```

The filter never matches. `tsxFiles` is always `[]`. `pickSectionTsxForMember` returns `null` for every cluster. The component-emission loop in `runBuild` `continue`s on every iteration. Zero files written under `<target>/src/components/`. The gate criterion that counts emitted components against `components.json.length` reports `0 of N`, fails the phase.

## Why the test suite missed it

`test/build.test.ts` injects a stub `runJsxGenerator` that writes a real `.tsx` file:

```ts
runJsxGenerator: async ({ outputDir }) => {
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, "01-section.tsx"), "export default function S(){ return <section/>; }");
},
```

The stub bypasses the real `generate-jsx.ts` script. Production runs the real script, which writes `.generated.jsx`, which the orchestrator filter rejects. Classic "test stubs decoupled from production output format" — same class of bug as ISSUE-005 (extract write/read contract mismatch). The integration test at `test/continue-build.integration.test.ts` uses the same stub.

## Proposed fix

Pick one. Option A is the smallest diff and respects spec § 14 (vendored scripts not modified). Option B is the more philosophically correct one but violates the vendored-scripts policy.

### Option A — Update the orchestrator filter (recommended)

`lib/build.ts` line 196:

```ts
// Match BOTH the production output (.generated.jsx) and the historical
// .tsx convention used by tests. Files are otherwise identical content;
// only the extension differs.
const tsxFiles = readdirSync(args.generatedDir)
  .filter(f => f.endsWith(".tsx") || f.endsWith(".generated.jsx"))
  .sort();
```

The `.sort()` keeps deterministic ordering. `pickSectionTsxForMember` then resolves correctly for both real and stub paths.

### Option B — Update generate-jsx.ts to emit .tsx (NOT recommended)

Would require editing `scripts/generate-jsx.ts` to write `.generated.tsx` instead of `.generated.jsx`. Violates spec § 14 vendored-scripts policy ("scripts in scripts/ are vendored verbatim from nextjs-migration-agent. They are not modified in the plugin."). Avoid.

### Bonus — make the test stub match production output format

After Option A lands, the test stub in `test/build.test.ts` should be updated to write `.generated.jsx` (matching production). That co-validates the fix and prevents this bug class from re-emerging — same lesson logged from ISSUE-005.

## Reproduction

1. On any project where Phase 4 has produced specs, run `migrate:build`
2. After codegen: `ls .migration/pages/<slug>/generated/` — see `*.generated.jsx` files
3. Check `<target>/src/components/` — empty
4. Check `phase-5-build/verification.json` — `every component in components.json was emitted: false`

## Action items

- [ ] Patch `lib/build.ts` `pickSectionTsxForMember` to accept both `.tsx` and `.generated.jsx` extensions
- [ ] Update test stubs in `test/build.test.ts` and `test/continue-build.integration.test.ts` to write `.generated.jsx` (production format)
- [ ] Add a regression test that asserts `pickSectionTsxForMember` returns content when the dir contains only `.generated.jsx` files
- [ ] Document the convention drift in `knowledge/phase-pitfalls/build.md`
