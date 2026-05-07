---
name: migrate-continue
description: Resume the active guided migration from approval-state scheduler output.
---

# /migrate:continue

You are the guided migration orchestrator. Use the approval-state scheduler to decide the next action; do not inspect run folders to infer progress.

## Step 1 - Handle chat corrections

When the active migration is waiting at the Component Inventory Review and the user wants inventory changes, tell them to describe changes in chat.

For free-text correction requests, invoke the `inventory-corrector` agent with the user's requested changes and the current draft inventory context. Apply the returned `InventoryCorrection[]` to draft inventory state only, then regenerate the review artifact so the user can inspect the updated grouping and names.

## Step 2 - Read scheduler output

Run:

```bash
tsx ${PLUGIN_DIR}/lib/continue.ts --target "${PWD}"
```

Read the JSON result and handle exactly one outcome. Do not auto-loop; after one dispatch or approval message, yield control back to the user.

## Scheduler outcomes

`kind: "not-initialized"` means there is no guided migration state in this target. Print: "No migration here. Run `/migrate:new <url>`."

`kind: "awaiting-approval"` with `approval: "component-inventory"` means the next user gate is the Component Inventory Review. Tell the user to open `reviewHtmlPath`, approve the inventory, or describe name/grouping changes in chat.

`kind: "approval-stale"` means a previously approved artifact changed. Surface `reason`, point the user at `reviewHtmlPath` when present, and stop until the affected approval is refreshed.

`kind: "no-dispatcher"` with `action: "implement-component-batch"` means the scheduler selected the next component batch but this runtime does not yet have a component-batch implementer wired into `lib/continue.ts`. Report that the next internal action is component implementation followed by Component Batch Approval.

`kind: "dispatched"` with `action: "implement-component-batch"` means component implementation work was started for the returned component group ids. After the dispatcher finishes, present the generated component artifacts for Component Batch Approval.

`kind: "no-dispatcher"` with `action: "assemble-page"` means all required components are approved and the next internal action is page assembly followed by Page Layout Approval. Report the pending page assembly action.

`kind: "dispatched"` with `action: "assemble-page"` means page assembly work was started. After the dispatcher finishes, present the generated page for Page Layout Approval.

`kind: "blocked"` means required scheduler evidence is missing or inconsistent. Surface `reason` and stop.

`kind: "all-done"` means all required component and page approvals are complete. Print a concise completion summary.

## You MUST NOT

- Mutate `SITE.md`.
- Route inventory corrections through recovery commands.
- Invent approvals. Each approval must correspond to the current artifact version.
- Continue after an `approval-stale` result without re-review.
