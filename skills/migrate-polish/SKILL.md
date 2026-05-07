---
name: migrate-polish
description: Run Phase 6 Visual polish for a specific migrated page slug or all migrated pages.
---

# /migrate:polish [slug|--all]

You are the Phase 6 Visual polish orchestrator. This command is **Phase 6 Visual only**: it improves visual parity. Phase 7 Animate and Phase 8 Perf remain pending follow-up phases and must be reported as pending, never as completed.

## Step 1 — Preconditions

Read `.migration/SITE.md` and the latest run with `phase-5-build/VERIFICATION.md`. If Phase 5 has not verified, stop:

> Phase 5 must complete first. Run `/migrate:build` or `/migrate:continue`.

Hard-require Playwright MCP-style live browser capability before starting. Open a blank page with the available browser/MCP tool and close it. If browser/MCP tooling is unavailable, stop:

> Phase 6 Visual polish requires Playwright MCP-style live browser access. No script-only fallback is allowed for visual polish.

## Step 2 — Resolve Scope

Accept either:

- `--all` — polish every migrated page in `library/routes.json`.
- `[slug]` — polish one page whose crawl slug or route path matches the argument.

The helper `tsx ${PLUGIN_DIR}/lib/polish.ts --target "${PWD}" --scope "${SCOPE}" --mcp-confirmed` creates or reuses a dedicated polish run and writes Phase 6 state under `.migration/runs/<polish-run>/phase-6-visual/`.

## Step 3 — Visual Method

Use the old `nextjs-migration-agent` visual loop closely:

1. Verify at viewports `375`, `768`, `1024`, and `1440`, in that order.
2. For every failing page/section, dispatch one visual agent, capped by `maxParallelSections`.
3. Give each visual agent a dedicated local port and live browser session.
4. The agent compares reference and local live, edits one component area at a time, and re-runs section verification after each edit.
5. Revert any change that worsens the section diff.

Guardrails for every visual agent:

- Never copy computed `width`, `height`, `gridTemplate*`, `position`, `top`, `right`, `bottom`, or `left` values.
- Do not broadly rewrite className strings.
- Do not restructure components unless the visual mismatch is impossible to fix locally.
- Never write text from memory; read reference text from the live reference page.
- Do not touch animation or performance-only concerns in Phase 6.

## Step 4 — Gate

The Phase 6 gate passes only when every scoped page section is below the visual threshold at every required viewport. Write:

- `.migration/runs/<polish-run>/phase-6-visual/PLAN.md`
- `.migration/runs/<polish-run>/phase-6-visual/EXECUTION.md`
- `.migration/runs/<polish-run>/phase-6-visual/verification.json`
- `.migration/runs/<polish-run>/phase-6-visual/VERIFICATION.md` only on pass
- `.migration/pages/<slug>/diffs/<viewport>/summary.json`

On success, print:

> Phase 6 Visual polish complete for `[scope]`. Phase 7 Animate and Phase 8 Perf remain pending.

On failure, surface failed page/section/viewport details from `verification.json`.

## You MUST NOT

- Claim the whole migration workflow is complete.
- Claim animations or performance are complete.
- Use a script-only fallback when browser/MCP capability is unavailable.
