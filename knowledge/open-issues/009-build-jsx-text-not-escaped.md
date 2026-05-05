# ISSUE-009: Phase 5 build emits JSX text containing unescaped `<` — `next build` parses it as a tag

**Surfaced by:** Phase 5 (Build)
**Severity:** Critical — any source page whose copy contains `<` followed by a non-letter (numerics, units, math, brand callouts like `<5kB`, `<100ms`, `<1MB`) emits a component file that fails `next build` with a JSX parse error. Phase 5 cannot pass on real-world marketing copy.
**Status:** Patched 2026-05-05 — `lib/build.ts` exports `escapeUnsafeLessThan(jsx)`. Wired into `transformOrWrap`'s raw-fragment branch (NOT the pre-wrapped branch). 5 unit tests in `test/build-tsx-wrapping.test.ts` cover digit-after-`<`, real tags, close tags, comment markers, repeated math copy. Integration test in `test/build.test.ts` ("escapes unsafe `<` in raw text content before wrapping") exercises the full transform.

## Evidence pattern

`next build` aborts with a JSX parse error like:

```
Failed to compile.

./src/components/OpenSourceFeatureList.tsx
Error:   x Expected '>', got 'numeric literal (5, 5)'
   ,-[31:1]
31 | ...class="...">Lightweight Client SDK (<5kB gzipped)</p>
   :                                       ^
```

The text node was `Lightweight Client SDK (<5kB gzipped)`. Babel's JSX parser sees `<5` and tries to start parsing a tag name — but `5` is not a valid tag-name-start character, so the parse fails immediately.

Common offenders:
- `<5kB`, `<100ms`, `<1s`
- `<!doctype` accidentally captured as text
- Math/comparison copy like "less than 1% pixel diff" written as `<1%`
- Code samples in marketing pages like `<div>` shown as inline literal

## Root cause

`scripts/generate-jsx.ts` reads text content from `<label>.structure.md` and embeds it verbatim into the emitted JSX. The structure.md, in turn, captured raw `textContent` from the DOM during Phase 4 extraction. DOM `textContent` returns characters as-is — `<` from the source HTML was already HTML-decoded into the literal `<` character.

When that literal `<` lands in JSX text position, the JSX parser sees it as the start of a tag. JSX text encoding rules require `<` (and `>`, `{`, `}`) in text content to be replaced with HTML entities (`&lt;`, `&gt;`) or wrapped in a JSX expression (`{"<5kB"}`). The vendored generator does neither.

Per spec § 14, vendored `scripts/generate-jsx.ts` is NOT modified. The fix lives in the plugin's wrap layer (`lib/build.ts` `transformOrWrap`), which already strips comments and injects imports.

## Proposed fix

Add a JSX-text escape pass to `transformOrWrap` BEFORE wrapping.

```ts
// Escape `<` followed by a non-tag-name character. JSX tag names must start
// with [a-zA-Z], `/`, `!`, or `?`. Anything else is a text-content `<` that
// will fail to parse if left bare. `&lt;` is the canonical JSX text escape.
//
// Note: this also escapes `<` inside attribute values, where `&lt;` is NOT
// HTML-decoded by JSX. Acceptable trade-off — the vendored generator does
// not currently emit `<` inside attribute values, and a literal `<5` in
// an attribute string would itself be malformed HTML in the source.
export function escapeUnsafeLessThan(jsx: string): string {
  return jsx.replace(/<(?![a-zA-Z/!?])/g, "&lt;");
}
```

Wire into `transformOrWrap`:

```ts
const stripped = raw.replace(/^\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)+/g, "").trim();
const escaped = escapeUnsafeLessThan(stripped);
const imports = detectNextImports(escaped);
return `${imports}export default function ${name}() { ... ${indentLines(escaped, 6)} ... }`;
```

For pre-wrapped input (the `if (/export\s+default\s+function/.test(raw))` branch), do NOT apply the escape — pre-wrapped components are presumed already valid JSX (they came from a hand-authored stub or a prior agent refinement run).

## Why the test suite missed it

Same root cause class as ISSUE-007 + ISSUE-008: test stubs ship pre-formed `<section/>` components that never contain text with `<` characters. The vendored generator's output (with raw text from real DOM) is the only path that triggers this.

## Reproduction

1. Pick any page on the demo whose copy contains `<5kB` or similar
2. Run Phase 4 → 5
3. `cd <target> && npx next build` fails with JSX parse error citing the offending line

## Action items

- [ ] Add `escapeUnsafeLessThan(jsx)` helper to `lib/build.ts`, exported alongside `transformOrWrap` and `detectNextImports`
- [ ] Apply it inside `transformOrWrap` for the raw-fragment branch only (NOT for pre-wrapped input)
- [ ] Add unit tests in `test/build-tsx-wrapping.test.ts` covering: text `<5kB` → `&lt;5kB`, real tag `<Image>` preserved, `<!--` (comment-like) preserved, `</div>` close tag preserved
- [ ] Update the integration test in `test/build.test.ts` ("wraps raw .generated.jsx output") to include a `<5kB` token in the stub input and assert the wrapped output contains `&lt;5kB`, NOT `<5kB`
- [ ] Document under `knowledge/phase-pitfalls/build.md` as a new pitfall
