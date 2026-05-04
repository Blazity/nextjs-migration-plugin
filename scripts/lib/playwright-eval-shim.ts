import type { BrowserContext } from "@playwright/test"

// `tsx` invokes esbuild with `keepNames: true`. esbuild injects a `__name`
// helper at the top of compiled modules so that `class X {}` survives as
// `var X = class {}; __name(X, "X");`. This is fine for Node code, but
// `page.evaluate` / `handle.evaluate` ship the function body to the browser
// context, where `__name` is undefined and every class declaration in the
// eval body throws `ReferenceError: __name is not defined`.
//
// Installing this script via `context.addInitScript` defines `__name` on the
// page's globalThis BEFORE any user script (or evaluated function body) runs.
// The bare-identifier reference `__name(X, "X")` resolves through globalThis
// in both strict and non-strict contexts, so the eval body executes cleanly.
//
// See knowledge/open-issues/006 for the full root-cause writeup.
export const NAME_SHIM_SCRIPT =
  ";(function(){if(typeof globalThis.__name!=='function'){globalThis.__name=function(t){return t}}})();"

export async function installNameShim(context: BrowserContext): Promise<void> {
  await context.addInitScript(NAME_SHIM_SCRIPT)
}
