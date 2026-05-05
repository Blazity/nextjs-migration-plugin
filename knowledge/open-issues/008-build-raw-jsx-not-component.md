# ISSUE-008: Phase 5 build writes raw JSX fragments that fail `next build` — no `export default`, no Next.js imports

**Surfaced by:** Phase 5 (Build)
**Severity:** Critical — even after ISSUE-007 (extension mismatch) is fixed, the emitted "component" files are not valid React modules. They will fail `next build` with `does not contain a default export` and `Image is not defined`. Gate criterion #4 (`next build` exit 0) cannot pass.
**Status:** Patched 2026-05-05 — `lib/build.ts` exports `transformOrWrap(raw, name)` and `detectNextImports(body)`. Replaces the old no-op `transformDefaultExportName`. Detects pre-wrapped vs raw input, strips leading JSX expression-comments, injects `import` lines for any of `<Image>` / `<Link>` / `<Script>`, and wraps raw fragments in `export default function <Name>() { return (<>...</>); }`. 9 unit tests in `test/build-tsx-wrapping.test.ts` cover the helper directly; one integration test in `test/build.test.ts` exercises the full orchestrator with the production `.generated.jsx` shape.

## Evidence pattern

After running `migrate:build` (with ISSUE-007 patched so files at least get written):

```bash
$ cat <target>/src/components/PageBody.tsx
{/* Auto-generated from blazity.com — do not edit classes manually */}
{/* Source: 01-navbar-component.structure.md + 01-navbar-component.styles.json */}

<div className="...">
  <Image src="/images/example.com/home/01-hero/logo-abc.png" alt="logo" width={120} height={40} />
  ...
</div>
```

Three problems visible:
1. **No `export default`.** The module exports nothing. `import PageBody from "@/components/PageBody"` resolves to `undefined`.
2. **`<Image>` referenced without import.** The `next build` TS step throws `Cannot find name 'Image'` (or `Image is not defined` at runtime).
3. **Comment-first.** The file starts with `{/* ... */}` which is a JSX expression-comment, valid only INSIDE JSX — at module top level it is a syntax error.

`next build` aborts. Phase 5 gate criterion #4 fails.

## Root cause

`scripts/generate-jsx.ts` line 220-221 produces a raw JSX fragment with a comment header, no module wrapping:

```ts
const outputFile = `${label}.generated.jsx`
const output = `{/* Auto-generated from blazity.com — do not edit classes manually */}\n{/* Source: ${structureFile} + ${stylesFile} */}\n\n${jsx}`
```

`renderJsx` (line 128 area) emits `<Image src="..." width={...} height={...} />` for img elements without ever importing `Image` from `next/image`:

```ts
return `${pad}<Image src="${localSrc}" alt="${alt}" width={${width}} height={${height}}${classes ? ` className="${classes}"` : ""} />\n`
```

The vendored script was originally written for the single-page `nextjs-migration-agent` workflow, where the JSX fragment was meant to be PASTED into a hand-authored component shell that already had `import Image from "next/image"` + `export default function Page() { ... }`. The plugin's automated pipeline writes it directly as a component file with no shell, breaking on every dimension at once.

`lib/build.ts:107` (`transformDefaultExportName`) tries to rename an existing `export default function` — but there isn't one, so the regex matches nothing, the file content goes through unchanged, and the missing-export problem survives.

## Why the test suite missed it

Same root cause as ISSUE-007: the test stub writes a self-contained `export default function S(){ return <section/>; }` instead of running the real `generate-jsx.ts`. The orchestrator's transform path is exercised on a happy-path string; production input never matches that shape.

## Proposed fix

Per spec § 14, vendored `scripts/*` are not modified. The plugin's `lib/build.ts` orchestrator must wrap the raw JSX fragment into a valid React module before writing the component file.

### Step 1 — Strip leading JSX comments

The vendored script emits `{/* ... */}\n{/* ... */}\n\n` as a header. Those are valid INSIDE JSX but invalid at module top level. Convert to TS comments OR strip entirely. Simplest: strip them.

### Step 2 — Detect referenced Next.js components and inject imports

Scan the JSX body for capitalized tag names: `Image`, `Link`, `Script`, `Head`. For each that appears, prepend the canonical Next.js import:

```ts
const NEXT_IMPORTS: Record<string, string> = {
  Image: 'import Image from "next/image";',
  Link: 'import Link from "next/link";',
  Script: 'import Script from "next/script";',
};

function detectAndImportNextComponents(body: string): string {
  const imports = Object.entries(NEXT_IMPORTS)
    .filter(([tag]) => new RegExp(`<${tag}\\b`).test(body))
    .map(([, line]) => line);
  return imports.length > 0 ? imports.join("\n") + "\n\n" : "";
}
```

### Step 3 — Wrap in `export default function <Name>()`

After stripping comments and injecting imports, wrap the JSX in a default-export function. The JSX may produce multiple top-level elements (a section followed by another section, etc.), so wrap them in a fragment:

```ts
function wrapAsComponent(rawJsx: string, name: string): string {
  const jsxBody = rawJsx
    .replace(/^\s*\{\/\*[\s\S]*?\*\/\}\s*/g, "") // strip leading JSX comments
    .trim();
  const imports = detectAndImportNextComponents(jsxBody);
  return `${imports}export default function ${name}() {
  return (
    <>
${indent(jsxBody, 6)}
    </>
  );
}
`;
}
```

Replace the current `transformDefaultExportName` (which is a no-op against this input) with `wrapAsComponent`.

### Step 4 — Treat existing-default-export input as already-wrapped

If a future codegen layer (the optional `--refine` agent path) produces a real React component with an existing `export default function`, do not double-wrap. Detect:

```ts
function transformOrWrap(raw: string, name: string): string {
  if (/export\s+default\s+function\s+\w+/.test(raw)) {
    // Already a component. Just rename.
    return raw.replace(/export\s+default\s+function\s+\w+/, `export default function ${name}`);
  }
  return wrapAsComponent(raw, name);
}
```

This preserves backward compatibility with the test stubs (they ship pre-wrapped components) AND fixes the production path (raw fragment → wrapped).

## Knock-on effect — page templates

`lib/page-assembler.ts` `assemblePageTsx` already emits `import <Name> from "@/components/<Name>"` for each component referenced. That part is fine — Bug C from the original report ("page templates reference component-name JSX with no imports") was a misread of the page output. The page TSX imports correctly. The component TSX is the broken layer.

If page TSX needs `<Image>` references too (e.g., when codegen later inlines images directly into pages), apply the same `detectAndImportNextComponents` pass in the page assembler. Not in scope for this ticket.

## Reproduction

1. Patch ISSUE-007 first so `.generated.jsx` files get read
2. Run `migrate:build`
3. `cat <target>/src/components/<Anything>.tsx` — observe missing `export default`
4. `cd <target> && npx next build` — fails with default-export missing AND Image undefined errors

## Action items

- [ ] Replace `lib/build.ts` `transformDefaultExportName` with `transformOrWrap` (or equivalent) that detects pre-wrapped vs raw-fragment input and applies the right transform
- [ ] Add `detectAndImportNextComponents` helper that scans JSX body for `<Image>`, `<Link>`, `<Script>` and injects the corresponding `import ... from "next/..."` line
- [ ] Strip leading JSX comments (`{/* ... */}`) from the raw fragment before wrapping
- [ ] Add unit tests in `test/build-tsx-wrapping.test.ts` (new file) covering: raw-fragment input → wrapped component; pre-wrapped input → renamed only; `<Image>` reference → import injected; multiple top-level elements → wrapped in fragment
- [ ] Update test stubs in `test/build.test.ts` and `test/continue-build.integration.test.ts` to write the REAL production format (raw JSX with comment header) so the orchestrator transform is exercised in the test path
- [ ] Add an integration smoke test that runs the real `generate-jsx.ts` against a tiny in-process HTTP fixture, then asserts `<target>/src/components/<X>.tsx` parses as a valid TS module (use `ts.createSourceFile` + check for `SyntaxKind.ExportAssignment` or default export node)
- [ ] Document the wrap pipeline in `knowledge/phase-pitfalls/build.md` as pitfall #8
