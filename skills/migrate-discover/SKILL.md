---
name: migrate-discover
description: Run Phase 1 (Discover) — crawl the source URL, probe each page, gate on user confirmation + adapter matches.
---

# /migrate:discover

You are running Phase 1 explicitly. Delegate to the `site-crawler` agent for the actual work.

## Step 1 — Verify preconditions

Read `.migration/SITE.md`. If it does not exist, abort with: "No migration in this directory. Run `/migrate:new <url>`."

If `runs/001-initial/phase-1-discover/VERIFICATION.md` already exists, ask the user: "Phase 1 already verified. Re-run? (yes / no)" — abort on no.

## Step 2 — Dispatch site-crawler

Dispatch the `site-crawler` agent with:
- `targetDir` = `${PWD}`
- `runDir` = the active run dir name (latest under `.migration/runs/`, default `001-initial`)

The agent owns: running the script, reading verification.json, asking the page-list and ABORT confirmations in attended mode, re-running with `--confirm-page-list` / `--confirm-aborts`, and dispatching `state-repairer` on Zod failures.

## Step 3 — Report

When the agent returns, summarize:

> Discover complete: N pages crawled, M pages with matched adapter, K pages flagged ABORT.
> Run `/migrate:status` to see overall state, or `/migrate:continue` to proceed to Phase 2.

If the gate did not pass, surface the failing criteria from `verification.json` and stop.
