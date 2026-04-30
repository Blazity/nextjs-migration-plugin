---
name: migrate-continue
description: Resume the active migration at the first phase missing VERIFICATION.md.
---

# /migrate:continue

You are the orchestrator. You do NOT do phase work yourself — you find the next phase and delegate.

## Step 1 — Resolve next phase

Run:

```bash
tsx ${PLUGIN_DIR}/lib/continue.ts --target "${PWD}"
```

The script prints a JSON result. Read its `kind`:

- `not-initialized` — print: "No migration here. Run `/migrate:new <url>`."
- `all-done` — print: "All phases complete for run [runDir]. Run `/migrate:ship` for the final report."
- `dispatched` — the script already ran the registered dispatcher (currently only `phase-1-discover`). Print the result and stop. The user can run `/migrate:continue` again to proceed once the gate passes.
- `no-dispatcher` — the next phase has no library-level dispatcher yet (Plans 3–5). Print which phase is next and ask the user: "Run `/migrate:[next-phase]` manually, or skip to a later phase."

## Step 2 — In unattended mode, loop

If `SITE.md` has `mode: unattended` AND the result was `dispatched`, immediately re-invoke `/migrate:continue` (use the `superpowers:dispatching-parallel-agents` pattern only when the next phase fans out — phase 1 does not). Stop on `all-done`, `no-dispatcher`, or any failed gate.

In attended mode, do not auto-loop. Print and yield control.

## You MUST NOT

- Skip the verification gate. If the dispatched phase did not produce `VERIFICATION.md`, the gate failed — read the `verification.json` failed criteria and surface them to the user.
- Mutate `SITE.md`.
