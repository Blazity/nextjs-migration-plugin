# Phase 5 (Build) — Pitfalls

## 1. Project scaffold must exist

`<target>/package.json` and `<target>/src/app/layout.tsx` must be present BEFORE Phase 5 runs. The orchestrator does not scaffold a Next.js app for the user — that is the user's job (typically via `npx create-next-app@latest <target> --app --typescript --tailwind`). The gate fails fast with a structured `missing: [...]` diagnostic if either file is absent.

## 2. Vendored generate-jsx.ts hardcodes input/output paths

`scripts/generate-jsx.ts` reads from `<specsDir>` and writes to `<outputDir>`. Both are positional CLI args. The runner targets `<specsDir> = pages/<slug>/spec/` and `<outputDir> = pages/<slug>/generated/`. Per spec § 14 the script is not modified — the runner adapts.

## 3. Dynamic routes share ONE template

Routes from `library/routes.json` are grouped by exact `nextRoute` string. When 9 source URLs share `/case-studies/[slug]`, the orchestrator emits exactly ONE `app/case-studies/[slug]/page.tsx` plus a `generateStaticParams` listing all 9 entries. The per-source-URL spec data is the data layer — the route file is the template layer. Do not write 9 separate route files.

## 4. Verify-build-baseline runs against the homepage only

Per spec § 5 the Phase 5 gate is "verify-build-baseline at 1440px". That script compares structural sections at one viewport for one page. Per-page coverage at all 4 viewports is Phase 6's domain. If users want broader coverage in Phase 5 they should use `/migrate:polish` after Phase 5 completes — that is the documented path.

## 5. Component name collisions

Two clusters whose `name` field sanitizes to the same PascalCase string would clobber the same TSX file. The sanitizer falls back to `Component<index>` for empty/all-symbol names; for genuine collisions of distinct sanitized names, suffix with the cluster id slice (`PageHero1`, `PageHero2`). Detect and warn during the component-emission loop; do NOT silently overwrite.

## 6. Asset copy is a flat tree-walk

`copyStagedAssets` walks `pages/<slug>/_staging/public/` recursively and replays the relative path under `<target>/public/`. If two pages stage the same image to the same path (e.g., a shared logo), the latter overwrites the former — both write the same bytes, so this is benign for hashed filenames (extract-images.ts uses md5-prefixed names). The hash convention guarantees stability; if you change the naming scheme upstream, update this assumption.

## 7. next build is the dominant cost

A 47-page wireframe build typically takes 30-90 seconds wall-clock once codegen is done. The runner caps at 600_000ms (`NEXT_BUILD_TIMEOUT_MS`). Override via env for very large projects.
