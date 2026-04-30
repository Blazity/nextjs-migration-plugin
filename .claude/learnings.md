# Learnings

- `new URL("https://example.com/About Us!").pathname` is percent-encoded to
  `/About%20Us!`. When building a slug, run `decodeURIComponent` on the pathname
  before stripping non-url-safe characters; otherwise the digits inside `%20`
  survive the `[^a-z0-9/]` filter and leak into the slug as `about-20us`. See
  `lib/slug.ts` and `test/slug.test.ts`.
