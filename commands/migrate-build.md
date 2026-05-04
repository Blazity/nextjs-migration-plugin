---
name: migrate:build
description: Run Phase 5 (Build) — generate Next.js TSX, run next build, verify against the source homepage.
argument-hint: "[--refine]"
---

Invoke the `migrate-build` skill. If `--refine` is passed, dispatch the page-builder agent for each component and re-run the build with refined TSX. Default flow is deterministic codegen + `next build` only.
