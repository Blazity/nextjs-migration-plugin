# ISSUE-011: Generated `app/layout.tsx` omits `import "./globals.css"` — Tailwind never compiles into the served bundle

**Surfaced by:** Phase 5 (Build) — surfaces post-build at `next dev` / `next start`
**Severity:** High — `next build` still exits 0 (no compile error), but the served HTML has no `<link rel="stylesheet">` and no Tailwind CSS bundle. Pages render as raw unstyled HTML. Phase 5 gate criterion #4 (`next build` passes) misses this, criterion #5 (`verify-build-baseline` at 1440px) catches it as a structural-section mismatch ONLY because the diff threshold trips — the actual root cause (no styles) is not surfaced clearly.
**Status:** Patched 2026-05-05 — `lib/layout-assembler.ts` now prepends `import "./globals.css";` to the emitted layout. Test in `test/layout-assembler.test.ts` ("prepends `import \"./globals.css\"`...") asserts ordering (CSS import precedes component imports). Integration assertion in `test/build.test.ts` layout-shell test confirms the import lands in the written `<target>/src/app/layout.tsx`.

## Evidence pattern

After running `migrate:build` on a project where any layout slot in `library/layouts.json` is populated:

- `<target>/src/app/layout.tsx` exists, exports a `RootLayout` that wraps `<html><body>{children}</body></html>` with header/footer/nav shells
- The first line of the file is `import Header from "@/components/Header";` (or similar component import) — NO `import "./globals.css";`
- `<target>/src/app/globals.css` exists (created by `create-next-app`) and contains Tailwind directives `@tailwind base; @tailwind components; @tailwind utilities;`
- `cd <target> && yarn dev` (or `next dev`) → page loads at `localhost:3000`
- View source on the served page → `<head>` has NO `<link rel="stylesheet" href=".../app/layout.css">` (or whatever Next.js names the route-level stylesheet)
- `.next/static/css/` is empty or contains only ~1KB of generated chunks, never the ~26KB Tailwind bundle

DOM is rendered correctly; Tailwind classes are present on every element; nothing is styled.

## Root cause

`lib/layout-assembler.ts` `assembleRootLayoutTsx` builds the layout file from scratch:

```ts
const imports = slots.map(s => `import ${s.componentName} from "@/components/${s.componentName}";`).join("\n");
return `${imports}

export default function RootLayout(...) { ... }
`;
```

Only component imports are emitted. The Tailwind / globals stylesheet must be imported by the App Router root layout for Next.js to include it in the build pipeline (`next build`'s CSS extraction walks `import "x.css"` statements). Without that import, Next.js never compiles `globals.css` into the route bundle, so the served HTML omits the stylesheet `<link>`.

`create-next-app` scaffolds `src/app/layout.tsx` WITH `import "./globals.css";` by default. When `assembleRootLayoutTsx` returns a non-null string, the orchestrator (`lib/build.ts:140`) overwrites the user's scaffolded layout — losing the globals import.

When `assembleRootLayoutTsx` returns `null` (no layout slots populated), the user's scaffolded layout.tsx is preserved AND retains its globals import. So this bug only fires when at least one of `layouts.json`'s `header`/`footer`/`nav` slots is non-null. In practice that is almost every real site (CMSes consistently produce a header).

## Why the test suite missed it

`test/layout-assembler.test.ts` checks for `import <ComponentName>` lines and the `RootLayout` export, but never asserts the presence of `import "./globals.css"`. The plugin's `next build` runner is stub-injected in `test/build.test.ts`; the assertions stop at `exitCode 0`. There is no test that walks the served HTML for the stylesheet `<link>`.

## Proposed fix

Two layers; pick one. (A) is the smallest diff and the right v1 default. (B) is more robust but adds configuration surface.

### Option A — Hardcode `import "./globals.css";` at the top of every emitted layout

`lib/layout-assembler.ts`:

```ts
export function assembleRootLayoutTsx(args: LayoutAssemblyArgs): string | null {
  const slots = [args.header, args.nav, args.footer].filter((s): s is LayoutSlot => Boolean(s));
  if (slots.length === 0) return null;
  const componentImports = slots.map(s => `import ${s.componentName} from "@/components/${s.componentName}";`).join("\n");
  // Tailwind directives live in <target>/src/app/globals.css (scaffolded by
  // create-next-app). This import is what triggers Next.js to bundle the
  // stylesheet into the route's CSS chunk. Without it the served HTML has
  // no <link rel="stylesheet"> and pages render unstyled. See open-issues/011.
  const cssImport = 'import "./globals.css";';
  return `${cssImport}
${componentImports}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  ...
}
`;
}
```

Risk: a target whose scaffold uses a different stylesheet name (e.g. `app.css`, `tailwind.css`) gets a broken import. In practice `create-next-app --tailwind` always emits `globals.css`, and that is the documented prerequisite (per `knowledge/phase-pitfalls/build.md` pitfall #1). Acceptable v1 default.

### Option B — Detect existing stylesheet imports in the user's scaffold

Read `<target>/src/app/layout.tsx` BEFORE overwriting; parse out any leading `import "<x>.css";` lines; preserve them in the emitted output. Robust against unusual scaffold conventions. Adds I/O to the assembler, which until now was a pure helper. Defer until Option A surfaces a real problem.

### Out of scope — `body` className for Tailwind font-family

Some scaffolds put `className={inter.variable}` on `<body>` (with a `next/font` import). Migrating that is its own ticket — Phase 5 uses a generic `<body>` and accepts a font regression for v1.

## Reproduction

1. Run any migration through Phase 5 where `layouts.json` has a populated header
2. `cat <target>/src/app/layout.tsx` — first line is `import Header from "@/components/Header";` (NO globals.css import)
3. `cd <target> && yarn dev`
4. Open `http://localhost:3000` — DOM is correct, no styles applied
5. View source → `<head>` has no stylesheet `<link>`

Manual workaround: prepend `import "./globals.css";` to `<target>/src/app/layout.tsx`, re-run `next build`. Tailwind bundle (~26KB) compiles, link injected.

## Action items

- [ ] Patch `lib/layout-assembler.ts` to prepend `import "./globals.css";` whenever a non-null layout is emitted
- [ ] Update `test/layout-assembler.test.ts` to assert the globals import is present in the emitted output
- [ ] Add an integration test in `test/build.test.ts` that asserts `<target>/src/app/layout.tsx` (when overwritten) contains `import "./globals.css";`
- [ ] Document the contract in `knowledge/phase-pitfalls/build.md`: scaffolded `<target>` must have `src/app/globals.css`; the orchestrator preserves that import when overwriting layout. Already captured implicitly in pitfall #1; add explicit reference.
- [ ] Long-term (Option B / out-of-scope-for-this-ticket): preserve any leading `import "*.css";` lines from the user's existing layout.tsx instead of hardcoding `./globals.css`. Track separately if a real user hits this.
