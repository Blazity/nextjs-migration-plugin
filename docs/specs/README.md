# Specs

Specs are standalone canonical product/design documentation. They describe intended behavior and contracts without task IDs, issue references, or implementation-plan context.

## Current Specs

- [`2026-04-21-migration-plugin-design.md`](2026-04-21-migration-plugin-design.md) — approved v1 design for the multi-page Next.js migration plugin.
- [`2026-05-07-guided-component-first-flow.md`](2026-05-07-guided-component-first-flow.md) — current user-facing guided flow, superseding the older phase-chain execution model.

## Rules

- Keep specs self-contained.
- Put implementation plans in `.ai/plans/`, not here.
- Put durable rationale that is not part of the spec contract in `docs/adrs/`.
- Update the owning spec before changing public behavior, phase contracts, or artifact contracts.
