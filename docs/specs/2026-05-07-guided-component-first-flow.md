# Guided Component-First Migration Flow

**Date:** 2026-05-07
**Status:** Draft, superseding execution model
**Supersedes:** User-facing execution model from `2026-04-21-migration-plugin-design.md`

## 1. Goal

The plugin should guide a website-to-Next.js migration through concrete visual checkpoints instead of a hands-off phase chain. The user approves component inventory, implemented component batches, and assembled page layouts. Internal phases and scheduling may still exist for resumability, but they are not the product workflow.

## 2. Removed v1 choices

v1 has one guided production-quality flow.

- Remove the user-facing `attended | unattended` execution mode choice.
- Remove the user-facing `wireframe | pixel-perfect` goal choice.
- Keep visual thresholds as internal verification settings, not onboarding choices.
- Remove user approval of an abstract `ROADMAP.md`; use concrete visual checkpoints instead.

## 2.1 Production Order

The default production path is:

1. **Design system foundation.** Extract source-derived global tokens before component implementation: fonts, font variables, Tailwind `@theme` values, colors, radii, spacing, section padding, containers, and body defaults. Common styling must be represented as named tokens wherever practical; arbitrary Tailwind values are reserved for one-off source measurements.
2. **Static migration build.** Implement components and pages using the design system foundation, extracted assets, approved inventory, and source structure. The first build should be clean and maintainable, not a pixel-chasing pass.
3. **Content, behavior, and site infrastructure.** Complete functional content, routing, metadata, forms, navigation behavior, interactive widgets, and source-observed motion that the site needs to be usable.
4. **Visual parity refinement.** Run final visual refinement only after the previous steps. Pixelmatch output is a diagnostic artifact; the intended primary signal is a perceptual or DOM-aware similarity metric that can tolerate harmless vertical offsets while still surfacing real structural differences.

The initial target band for the late visual refinement signal is roughly `0.92-0.95` structural/perceptual similarity, subject to validation against real migration runs. Raw pixel percentages may still be reported for debugging, but they are not the product definition of "ready."

## 2.2 Interactive Behavior Pass

Before final visual parity refinement, the plugin must classify each approved component into one interaction class:

- `static` — no behavior beyond normal navigation links.
- `css-state` — behavior is representable with CSS states such as hover, focus, active, pressed, or open states.
- `client-state` — behavior requires React/browser state such as menus, drawers, tabs, accordions, dialogs, carousels, filters, or pagination.
- `form-integration` — behavior requires validation, submission, server actions, API calls, or third-party services.
- `motion` — behavior requires source-observed animation or time/scroll behavior such as marquees, reveal effects, autoplaying media, or animation timelines.

Classification should be evidence-based. Source evidence can come from DOM shape, form fields, controls, links, ARIA/state attributes, Webflow IX2 data, event-like classes, screenshots at different states, extracted animation data, and browser probing.

For `client-state`, `form-integration`, and `motion` components, the plugin must either implement the behavior or record an explicit unresolved behavior item before final approval. The behavior gate verifies representative states with browser automation: open/closed menus, carousel next/previous/dots, form validation or submission path, hover/focus/active styles, and animation start/end or steady-state frames where relevant.

`css-state` behavior can remain CSS-only, but the verification harness should still capture representative hover/focus states when they materially affect the visual result.

## 3. User-visible checkpoints

### 3.1 Component Inventory Review

`/migrate:new <url>` initializes migration state, crawls/probes the source, discovers sections, deduplicates them into component groups, captures references, and stops at a read-only local review artifact.

The normal product path uses `/migrate:new <url>` to reach the first Component Inventory Review. Explicit phase commands such as `/migrate:discover`, `/migrate:analyze`, and `/migrate:extract` may remain as internal/debug recovery commands, but they are not the primary user workflow.

To avoid command-surface confusion, prefer removing explicit user-facing phase skills/commands from the normal plugin surface. Keep underlying scripts or library entry points as recovery tools so the user can still request manual recovery when needed.

The intended user-facing command surface is small:

- `/migrate:new`
- `/migrate:continue`
- `/migrate:status`
- `/migrate:help`

`/migrate:continue` is redefined as "continue the guided migration from the current approval state", not "run the next old phase." It should show or regenerate pending review artifacts, schedule the next component batch, surface approval links, or assemble eligible pages based on durable state.

`/migrate:config` is removed from the normal command surface. Since `mode` and `goal` are gone, settings such as browser concurrency or thresholds are advanced state/tooling. `/migrate:status` can show current settings, and the user can ask in chat to change them when needed.

The review artifact:

- groups discovered sections by inferred component group,
- shows semantic proposed component names and stable tracking IDs,
- shows cropped component reference screenshots,
- supports viewport toggles for `390`, `768`, and `1440`,
- links each instance to the source page it came from,
- stores every discovered section instance while initially showing a capped sample with a way to reveal hidden instances.

The user corrects the inventory through chat, not an editable UI. The model updates inventory state and regenerates the review artifact.

Corrections and approvals are natural-language chat actions in the normal flow. Slash commands may exist later for deterministic fallback or recovery, but they are not the primary approval interface.

Inventory approval is blocked while any implementation component name is generic or ID-like.

### 3.2 Component Batch Approval

After inventory approval, the migration scheduler chooses small component batches in this order:

1. shared shell components such as header, nav, and footer,
2. high-reuse components,
3. unique or low-reuse components.

Default batch size is 1-3 components.

For regular content components:

- generate semantic TSX component files,
- generate Storybook stories for approved variants,
- render stories across `390`, `768`, and `1440`,
- compare story renders against component reference evidence,
- report pixel-diff artifacts as diagnostics,
- prefer perceptual or DOM-aware similarity as the readiness signal once the metric is available,
- send Storybook/reference/diff links to the user for explicit approval.

Passing automated verification means ready for human review, not approved.

Shared shell components may have Storybook stories for implementation and manual inspection, but they do not require isolated visual-diff verification because placeholder content makes isolated comparison unreliable. They are visually validated in context during page layout assembly.

### 3.3 Page Layout Approval

Page layout assembly begins for a page only after every component required by that page has user approval.

The plugin assembles the page from approved components, compares the full page against source page reference screenshots at `390`, `768`, and `1440`, and asks the user for approval.

Initial page-level verification reports pixel diff as a diagnostic. The late visual refinement target should move to the same perceptual or DOM-aware similarity signal used for component review once that metric is available.

## 4. Reference artifacts

Migration start captures two reference families:

- component reference screenshots: cropped section screenshots for grouping and component implementation,
- page reference screenshots: full-page screenshots for later page layout refinement.

Raw discovery evidence is immutable. Chat-driven corrections modify draft inventory state, not the raw crawl, section, or screenshot evidence.

Tracking IDs are metadata. They may appear in JSON and optional source comments, but they must not appear in generated component symbols or file names.

Generated implementation names must be semantic PascalCase names such as `Hero`, `PricingCard`, `FeatureGrid`, or `SiteHeader`.

## 5. Browser-bound work

Screenshot capture and visual comparison require real browser rendering. They run through a browser work queue with conservative default concurrency.

Default browser work queue concurrency: `1`.

Model/code work may prepare pending batches in parallel, but browser verification jobs queue through the shared browser limit.

## 6. Pending work

While the user reviews one verified component batch, the plugin may prepare another batch as pending work.

Pending work must not:

- overwrite approved components,
- mark components ready,
- assemble pages,
- bypass user approval.

If the user rejects or changes a batch, dependent pending work is invalidated and regenerated. Independent pending work can be preserved.

## 7. Internal scheduling

The old `Plan` phase becomes an internal migration scheduler. It can compute component/page readiness and next batches, but users do not approve `ROADMAP.md` as a workflow checkpoint.

The durable user approvals are:

1. Component Inventory Review,
2. Component Batch Approval,
3. Page Layout Approval.

Approvals are stored as explicit state files, not inferred from phase verification files. Suggested locations:

- `.migration/approvals/component-inventory.json`
- `.migration/approvals/components/[component-id].json`
- `.migration/approvals/pages/[slug].json`

Each approval records the approved IDs and names, approval timestamp, approved artifact version or hash, and user notes when present.

Every review artifact has a manifest hash or version. Approval records reference that artifact version. If chat-driven correction, screenshot recapture, or regeneration changes the referenced artifact, the previous approval becomes stale and must be re-approved.

Approved states also produce baseline screenshots used for later regression checks during refinement. These are rendered migrated screenshots, not source reference screenshots. Source reference screenshots define the target; approved baselines define the last user-approved migrated state.

Regression checks against approved baselines use a stricter threshold than source-fidelity checks. Initial regression threshold: `0.1%`. Any intentional change beyond that threshold requires a new user approval and baseline update.

Dynamic or unstable region masking is deferred for now. Baseline work starts without a masking requirement; revisit masking if regression checks become noisy.

## 8. State model additions

Separate raw evidence from user-approved migration state.

Suggested locations:

- raw discovery evidence: `.migration/discovery/sections.json` and `.migration/references/**`
- draft inventory: `.migration/inventory/component-inventory.json`
- approved inventory gate: `.migration/approvals/component-inventory.json`

Code generation and Storybook read from the approved component inventory, not directly from raw discovery clusters.
