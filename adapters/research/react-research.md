# React (Generic) Adapter Research

**Date:** 2026-03-30
**Adapter:** .ai/adapters/react.json

## Official Documentation Sources
- React DOM source (ReactDOMComponentTree.js) — internal properties: __reactFiber$*, __reactContainer$*, __reactProps$*, __reactEvents$*
- React 18 createRoot API — replaced ReactDOM.render(), uses __reactContainer$* instead of _reactRootContainer
- React Router v7 docs — framework mode uses __reactRouterContext, __reactRouterManifest (Remix successors)

## Live Sites Inspected
- excalidraw.com — Vite+React 18, #root with __reactContainer$, old adapter FAILS to detect (createRoot, no _reactRootContainer)
- soundcloud.com — React with #app (not #root), adapter FAILS
- app.todoist.com — React with #todoist_app (custom ID), adapter FAILS
- reactrouter.com — React Router v7 framework mode, should be EXCLUDED from generic React

## Detection Signals Found
- JS globals: __reactFiber$* on any DOM node (universal), __reactContainer$* on root (React 18+), _reactRootContainer (legacy only)
- DOM markers: [data-reactroot] (legacy SSR only)
- Exclusions needed: __NEXT_DATA__, /_next/, ___gatsby, __remixContext, __reactRouterContext

## Quirks Discovered
1. Full SPA — client-side only rendering
2. Loading state on navigation
3. Arbitrary root IDs — not just #root
4. Meta-framework exclusion list expanded
5. React 18 createRoot breaks old detection
6. Fiber key randomness — prefix matching required

## Open Questions
- None
