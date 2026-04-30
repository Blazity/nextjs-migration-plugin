# Learnings

- `new URL("https://example.com/About Us!").pathname` is percent-encoded to
  `/About%20Us!`. When building a slug, run `decodeURIComponent` on the pathname
  before stripping non-url-safe characters; otherwise the digits inside `%20`
  survive the `[^a-z0-9/]` filter and leak into the slug as `about-20us`. See
  `lib/slug.ts` and `test/slug.test.ts`.

- tsx/esbuild `keepNames` injects calls to a `__name(fn, "name")` helper around
  named function declarations and named arrow consts (e.g.
  `const tagPath = (...) => {...}`). When such a function is shipped into a
  Playwright page eval (`page.$$eval`, `page.evaluate`), the helper is not
  defined in the page context and the in-page code throws
  `ReferenceError: __name is not defined`. The wrapping `try/catch` then
  silently swallows the error and yields empty results. Fix: shim it inside
  the eval body with
  `if (typeof globalThis.__name !== "function") globalThis.__name = (fn) => fn;`
  as the very first statement, before any const declarations. See
  `scripts/discover-sections.ts`.
