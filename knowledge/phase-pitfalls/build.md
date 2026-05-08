# Phase 5 (Build) — Pitfalls

## 1. Project scaffold must exist

`<target>/package.json` and `<target>/src/app/layout.tsx` must be present BEFORE Phase 5 runs. The orchestrator does not scaffold a Next.js app for the user — that is the user's job (typically via `npx create-next-app@latest <target> --app --typescript --tailwind`). The gate fails fast with a structured `missing: [...]` diagnostic if either file is absent.

## 2. Vendored generate-jsx.ts hardcodes input/output paths

`scripts/generate-jsx.ts` reads from `<specsDir>` and writes to `<outputDir>`. Both are positional CLI args. The runner targets `<specsDir> = pages/<slug>/spec/` and `<outputDir> = pages/<slug>/generated/`. Per spec § 14 the script is not modified — the runner adapts.

## 3. Dynamic routes share ONE template

Routes from `library/routes.json` are grouped by exact `nextRoute` string. When 9 source URLs share `/case-studies/[slug]`, the orchestrator emits exactly ONE `app/case-studies/[slug]/page.tsx` plus a `generateStaticParams` listing all 9 entries. The per-source-URL spec data is the data layer — the route file is the template layer. Do not write 9 separate route files.

## 4. Per-page section components are intentional in v1

Phase 5 default codegen emits one component per generated page section, plus layout shells. This can produce many numbered, duplicate-looking files such as `CaseStudyCookunity05...` and `CaseStudyVibes05...`. That is acceptable for v1 because the first build prioritizes visual locality and successful compilation over premature prop API design.

The reusable component plan still exists in `library/components.json`; treat it as a registry of consolidation opportunities. Prop-based reusable React components should be introduced after the baseline build is stable, during polish/refactor, with visual regression coverage for every page that shares the component.

## 5. Extracted globals override scaffold theme defaults

`create-next-app` may ship `src/app/globals.css` with a `prefers-color-scheme: dark` block. Phase 5 must replace that scaffold default using the homepage `spec/00-globals.json` body foundation. Otherwise a source site with `body.backgroundColor: rgb(255, 255, 255)` can render with a black local background for users whose OS/browser prefers dark mode.

## 6. Verify-build-baseline runs against the homepage only

Per spec § 5 the Phase 5 gate is "verify-build-baseline at 1440px". That script compares structural sections at one viewport for one page. Per-page coverage at all 4 viewports is Phase 6's domain. If users want broader coverage in Phase 5 they should use `/migrate:polish` after Phase 5 completes — that is the documented path.

Phase 5 owns the local server lifecycle for this check. After `next build`, it starts a fresh `next start` on an available local port, waits for HTTP readiness, runs `verify-build-baseline` against that URL, then tears the server down. Do not rely on a manually started `localhost:3000`; it may be missing or serving a stale `.next/` build.

## 7. Component name collisions

Two clusters whose `name` field sanitizes to the same PascalCase string would clobber the same TSX file. The sanitizer falls back to `Component<index>` for empty/all-symbol names; for genuine collisions of distinct sanitized names, suffix with the cluster id slice (`PageHero1`, `PageHero2`). Detect and warn during the component-emission loop; do NOT silently overwrite.

## 8. Asset copy is a flat tree-walk

`copyStagedAssets` walks `pages/<slug>/_staging/public/` recursively and replays the relative path under `<target>/public/`. If two pages stage the same image to the same path (e.g., a shared logo), the latter overwrites the former — both write the same bytes, so this is benign for hashed filenames (extract-images.ts uses md5-prefixed names). The hash convention guarantees stability; if you change the naming scheme upstream, update this assumption.

Phase 5 also gates emitted asset references after codegen. Every `/...png|jpg|jpeg|webp|svg|gif|avif|woff|woff2|mp4|webm|ico` string found under `src/components/` or `src/app/` must resolve under `<target>/public/`. Missing files are hard failures, not warnings, because a compiling site with broken image/font/video URLs is not a valid baseline.

## 9. Vendored generate-jsx.ts emits raw JSX, not React modules

`scripts/generate-jsx.ts` writes `<label>.generated.jsx` files containing a leading JSX comment header followed by a raw JSX fragment with no `export default`, no `import` lines, and references to `<Image>` (Next.js) without the corresponding `import Image from "next/image"`. The script was originally designed for a single-page workflow where the fragment was hand-pasted into a component shell. The plugin's automated pipeline must wrap it.

`lib/build.ts` exposes two helpers that handle this:
- `detectNextImports(body)` — scans the JSX body for `<Image>`, `<Link>`, `<Script>` and returns the matching `import ... from "next/..."` lines.
- `transformOrWrap(raw, name)` — if the input is already a wrapped component (`export default function ...`), just renames the export. Otherwise strips leading expression-comments, injects Next.js imports, and wraps the body in `export default function <Name>() { return (<>...</>); }`.

Per spec § 14, the vendored script is NOT modified. The wrap layer is the plugin's responsibility. Test stubs that ship pre-wrapped components remain valid (the helper detects them and just renames). A regression test in `test/build.test.ts` exercises the production `.generated.jsx` shape end-to-end.

## 10. Generator output extension is `.generated.jsx`, not `.tsx`

Codegen output lands at `pages/<slug>/generated/<label>.generated.jsx`. The orchestrator's file picker (`pickSectionTsxForMember`) accepts both `.tsx` (used by test stubs) and `.generated.jsx` (production). Adding a new generator? Either match one of those extensions or update the picker.

## 11. JSX text content with `<` followed by digits or punctuation

Marketing copy like "Lightweight Client SDK (<5kB gzipped)" contains a literal `<` in a text node. The vendored `generate-jsx.ts` writes that verbatim, and the JSX parser then tries to parse `<5` as a tag (fails — `5` is not a valid tag-name-start character). `lib/build.ts` `escapeUnsafeLessThan` runs inside `transformOrWrap` to convert any `<` not followed by `[a-zA-Z/!?]` into `&lt;`. Real tags (`<Image>`, `<div>`, `</div>`, `<!--`) are preserved. Pre-wrapped components are NOT escaped (presumed already valid). See open-issues/009.

## 12. Layout-shell components are emitted on top of components.json

`library/layouts.json` carries header/footer/nav shells separately from `library/components.json` (by design — `lib/analyze.ts:extractComponents` excludes them). The orchestrator emits `<target>/src/components/Header.tsx`, `Footer.tsx`, `Nav.tsx` for each populated slot, resolving the section TSX via `tagSkeleton` match against `phase-2-analyze/analysis/sections.json`. This means `loadSections` is now a Phase 5 precondition. The hardcoded slot names match what `assembleRootLayoutTsx` imports as a fallback — long-term, accept the names from the orchestrator instead. See open-issues/010.

## 13. Overwriting the user's layout.tsx must preserve `import "./globals.css"`

When `library/layouts.json` has any populated slot, `assembleRootLayoutTsx` writes a fresh `<target>/src/app/layout.tsx` that overwrites `create-next-app`'s scaffold. The scaffold's first line is `import "./globals.css";` — required for Next.js to extract Tailwind into the route's CSS chunk. The plugin's emitter now hardcodes that import so the overwritten layout still ships styles. If a target uses a non-default stylesheet path (e.g. `app.css`, `tailwind.css`), the hardcoded import will break — track upgrades to a "preserve existing CSS imports" strategy in open-issues/011 if a real user hits this. See open-issues/011.

## 14. next build is the dominant cost

A 47-page build typically takes 30-90 seconds wall-clock once codegen is done. The runner caps at 600_000ms (`NEXT_BUILD_TIMEOUT_MS`). Override via env for very large projects.
