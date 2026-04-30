---
name: migrate-verify
description: Re-evaluate the gate for a phase without re-running the work. Reads phase artifacts and rewrites verification.json.
---

# /migrate:verify [phase]

Re-check the gate for a single phase. Useful after the user has manually edited an artifact (e.g., trimmed `crawl.json` page list) or confirmed a flagged page.

## Step 1 — Resolve target phase

If the user supplied a phase id, use it. Otherwise read the first incomplete phase via:

```bash
tsx ${PLUGIN_DIR}/lib/continue.ts --target "${PWD}"
```

(Use the `phase` field of the JSON output.)

## Step 2 — Re-run the phase's verifier

For `phase-1-discover`, dispatch the `site-crawler` agent with explicit instructions: "Do not re-crawl. Re-read crawl.json and probe.json, ask user for any missing confirmations, and re-emit verification.json."

Concretely the agent invokes:

```bash
tsx ${PLUGIN_DIR}/lib/discover.ts \
  --target "${PWD}" --run "${RUN_DIR}" \
  --confirm-page-list --confirm-aborts
```

The discover driver is idempotent on re-run: it will overwrite the crawl artifacts with a fresh crawl, which is the correct behavior — partial confirmation should not freeze a stale crawl. If you want a true verify-only mode that skips the crawl, exit with: "Verify-only mode is not yet implemented for Phase 1; run `/migrate:discover` to re-crawl."

## Step 3 — Report the new gate result

If `VERIFICATION.md` now exists, print: "Phase [phase-id] verified."
Otherwise, print the failed criteria from `verification.json` and exit.
