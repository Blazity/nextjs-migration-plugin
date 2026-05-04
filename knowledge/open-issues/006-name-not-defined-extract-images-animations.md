# ISSUE-006: `__name is not defined` ReferenceError in extract-images and extract-animations Playwright evals

**Surfaced by:** Phase 4 (Extract)
**Severity:** Critical — every page in the demo run (47/47) fails the `images` and `animations` extract steps with this error. `images.json` and `animations.json` are never written. `manifest.json` `errors[]` records the failure but the orchestrator continues, producing schema-clean but data-empty manifests.
**Status:** Open

## Evidence pattern

`pages/<slug>/manifest.json` `errors[]` contains entries like:

```json
{
  "step": "images",
  "message": "Command failed: npx tsx .../scripts/extract-images.ts ...\nelementHandle.evaluate: ReferenceError: __name is not defined\n    at eval (eval at evaluate (:302:30), <anonymous>:1:37)\n    at UtilityScript.evaluate (<anonymous>:304:16)\n    at UtilityScript.<anonymous> (<anonymous>:1:44)\n    at extractImagesFromPage (.../scripts/lib/extract-images-core.ts:1017:22)"
}
```

Same pattern for `step: "animations"` with stack inside `extract-animations-core.ts:79` (`evalSnapshot`) and `155` (`observePageLoadAnimations`).

`pages/<slug>/spec/images.json` does NOT exist; `animations.json` does NOT exist.

## Root cause

`tsx` (the loader used to run TS files at runtime) configures esbuild with `keepNames: true` for stack-trace fidelity. esbuild's `keepNames` injects a helper named `__name` at the top of compiled CommonJS / ESM modules:

```js
var __name = (target, value) => Object.defineProperty(target, "name", { value, ... });
```

Every `class X { method() {} }` declaration gets rewritten to `__name(method, "method")`. This is fine for code that runs in Node (the helper is in scope at the file top).

`page.evaluate` and `elementHandle.evaluate` serialize the function body to a **string** via `Function.prototype.toString()`, ship it to the browser, and `eval` it inside the page context. The compiled body still contains `__name(...)` calls — but the helper definition is at the top of the Node module, not inside the function body. The browser eval has no `__name` in scope. Throws `ReferenceError: __name is not defined` on first call site (any class declaration, arrow with `name` annotation, or method shorthand inside the eval body).

This affects:
- `scripts/lib/extract-images-core.ts:1017` (`extractImagesFromPage` — `handle.evaluate` for shell-meta extraction)
- `scripts/lib/extract-animations-core.ts:79` (`evalSnapshot`) and `:155` (`observePageLoadAnimations`)

Likely affects more eval sites that haven't fired in this demo run because their Webflow-specific code paths weren't hit.

## Why this is recurring

Earlier session memory records this as fixed via a `__name` shim at the top of in-page eval bodies in `probe-page.ts`. Confirmed via grep: zero `__name` references anywhere in `scripts/`. Either the fix was reverted, applied to a vendored upstream that drifted on re-vendor, or never applied to extract-images/animations cores in the first place.

The vendored-scripts policy (spec § 14: "scripts/* and scripts/lib/* are vendored verbatim from nextjs-migration-agent") makes this prone to regression on every re-vendor unless the shim is treated as a plugin-side patch with explicit re-application.

## Proposed fix

Inject a 1-line shim at the very top of every in-page eval body that may transitively reference `__name`. The shim defines `__name` as a no-op identity function in browser context:

```ts
await handle.evaluate((el: Element) => {
  // @ts-expect-error injected for tsx/esbuild keepNames helper
  globalThis.__name = globalThis.__name || ((target: unknown) => target);
  // ... existing code ...
});
```

For complex eval bodies, hoist the shim into a shared utility:

```ts
// scripts/lib/playwright-eval-shim.ts
export const NAME_SHIM = `globalThis.__name = globalThis.__name || ((t) => t);`;
```

And inline-prepend at every eval call. Less ergonomic — the inline shim per-eval is fine.

### Alternative — disable keepNames for in-page evals

Configure tsx/esbuild for the extract-images/animations entry points specifically with `keepNames: false`. Loses stack-trace fidelity for those files but eliminates the `__name` injection. Heavier-handed and per-file build config is awkward with tsx — not recommended.

### Alternative — switch to tsx-side eval-string injection

Have a build step pre-process eval bodies to strip `__name` calls. Brittle — best avoided.

**Recommendation: per-eval `globalThis.__name` shim.** Tiny, explicit, survives re-vendor as long as the shim line is preserved (and easy to re-apply if it isn't).

## Reproduction

1. Run `migrate:extract` on any site with shell sections (header/footer/nav)
2. `cat .migration/runs/*/phase-4-extract/extraction/manifest.json | jq '[.[].errors[]] | group_by(.step) | map({step: .[0].step, count: length})'`
3. Expect every page to have `images` and `animations` errors with `__name is not defined`

Demo run (blazity.com, 47 pages): 47/47 pages errored on both images and animations.

## Action items

- [ ] Patch `scripts/lib/extract-images-core.ts` to prepend `globalThis.__name ||= (t) => t;` at the top of every `handle.evaluate` / `page.evaluate` body that runs against the browser
- [ ] Patch `scripts/lib/extract-animations-core.ts` similarly for `evalSnapshot` and `observePageLoadAnimations`
- [ ] Audit all `scripts/lib/*-core.ts` files for additional `evaluate` call sites and apply the shim defensively
- [ ] Add a regression test: a Playwright fixture page + a minimal `evaluate` body containing a class declaration should run without `__name` error after the shim is applied
- [ ] Document the keepNames pitfall in `knowledge/phase-pitfalls/extract.md` with the shim snippet
- [ ] Track in maintenance log: any future re-vendor from `nextjs-migration-agent` must re-apply the shim (or upstream the shim there)
