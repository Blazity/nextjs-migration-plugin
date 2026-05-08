# Next.js Migration Plugin

This context defines the language for a guided website-to-Next.js migration workflow. It keeps product concepts precise while the plugin flow is being redesigned.

## Language

**Guided Migration Flow**:
A migration flow where the user approves meaningful checkpoints before the plugin proceeds.
_Avoid_: attended mode, unattended mode

**Migration Start**:
The initial command flow that creates migration state, gathers source evidence, and stops at the first user approval checkpoint.
_Avoid_: init-only bootstrap

**Component-First Migration**:
A migration approach that extracts, deduplicates, verifies, and approves reusable components before assembling pages.
_Avoid_: page-first migration, hands-off migration

**Component Inventory Review**:
A read-only local review artifact that shows proposed component groups with source screenshots across device widths.
_Avoid_: editable dashboard, component grouping UI

**Raw Discovery Evidence**:
Immutable source evidence captured from crawling, section discovery, and reference screenshots.
_Avoid_: editable component inventory

**Approved Component Inventory**:
The user-approved component grouping and semantic naming state used by code generation and Storybook.
_Avoid_: raw discovery clusters as codegen input

**Component Reference Screenshot**:
A cropped source screenshot of one discovered section used to review and implement a component variant.
_Avoid_: full-page component evidence

**Section Instance ID**:
A stable tracking identifier for one discovered source section across inventory regenerations.
_Avoid_: component name, implementation file name

**Implementation Component Name**:
A semantic PascalCase name used for generated component symbols and files.
_Avoid_: tracking IDs in names, Component1, Component2

**Component Story**:
A Storybook story for one approved component variant, used as the implementation and verification target.
_Avoid_: page-only verification target

**Shared Shell Component**:
A reusable layout shell such as a header, navigation, or footer that frames page content.
_Avoid_: page layout

**Component Visual Verification**:
A comparison between a rendered Component Story and its approved Component Reference Screenshot across the Reference Viewport Set.
_Avoid_: page-first visual verification

**Browser-Bound Verification**:
Verification work that must render source or migrated UI in a real browser and is therefore constrained by local browser capacity.
_Avoid_: unlimited parallel visual jobs

**Browser Work Queue**:
A serialized or low-concurrency queue for screenshot capture and visual comparison jobs.
_Avoid_: per-agent browser ownership, unlimited browser fan-out

**Component Batch**:
A small ordered set of approved components implemented and reviewed together.
_Avoid_: whole-site implementation batch

**Component Approval**:
The user's explicit confirmation that a verified component or component batch is ready for page layout assembly.
_Avoid_: automated pass as approval

**Approval Record**:
A durable migration state file that records an explicit user approval and the artifact version it approved.
_Avoid_: inferred approval from phase verification

**Approved Baseline**:
The approved screenshot set used to detect visual regressions during later refinements.
_Avoid_: transient diff output

**Migration Scheduler**:
The internal planning mechanism that chooses the next component or page batch.
_Avoid_: user-approved roadmap

**Recovery Tool**:
An internal callable script or library entry point used for manual recovery without appearing as a normal user-facing command.
_Avoid_: recovery slash command

**Pending Component Batch**:
A component batch that may be prepared in the background but is not approved and must not affect page assembly.
_Avoid_: pre-approved batch, hidden completion

**Page Reference Screenshot**:
A full-page source screenshot used later to refine page layout and composition.
_Avoid_: component grouping evidence

**Page Layout Assembly**:
The step that composes an approved page from approved components and verifies it against full-page references.
_Avoid_: assembling pages from unapproved components

**Reference Viewport Set**:
The standard source capture widths used for component and page references: 390, 768, and 1440.
_Avoid_: ad hoc viewport choices

**Chat-Driven Correction**:
A correction workflow where the user describes inventory changes in chat and the model updates migration state.
_Avoid_: drag-and-drop grouping, in-page editing

**Natural-Language Approval Action**:
A chat instruction that approves or corrects migration state without requiring a slash command.
_Avoid_: command-first approval flow

**Visual Fidelity Target**:
The expected production-quality visual match between the migrated output and the source reference.
_Avoid_: pixel-perfect goal, wireframe goal

**Design System Foundation**:
The generated target project's named styling foundation: source-derived colors, radii, spacing, typography, fonts, and global CSS tokens applied before component implementation.
_Avoid_: component-by-component arbitrary Tailwind guessing

**Static Migration Build**:
The component and page implementation pass that uses the Design System Foundation, extracted assets, and source structure to create clean migrated output before behavior, motion, and visual refinement.
_Avoid_: visual polish pass, pixel-perfect pass

**Visual Parity Refinement**:
The late refinement pass that improves source fidelity after the Design System Foundation, Static Migration Build, functional content, and required behavior are in place.
_Avoid_: first implementation pass, arbitrary pixel chasing

**Perceptual Verification Metric**:
A similarity signal such as SSIM, perceptual hash, or DOM-aware element comparison that better reflects human visual closeness than raw pixel mismatch.
_Avoid_: primary pixelmatch gate

**Pixel Diff Diagnostic**:
A pixelmatch-style screenshot diff used to locate or illustrate visual differences, not the primary readiness metric for the guided flow.
_Avoid_: visual fidelity target

**Interactive Behavior Pass**:
A late pass that classifies and implements source behavior for interactive components, including form submission, carousels, menus, accordions, hover states, pressed/open states, and animations.
_Avoid_: static screenshot parity

**Interaction Class**:
The behavior category assigned to an approved component before final review: `static`, `css-state`, `client-state`, `form-integration`, or `motion`.
_Avoid_: boolean interactive/non-interactive

**Verification Threshold**:
The maximum acceptable readiness value used by the plugin to decide whether a component or page is ready for user review.
_Avoid_: pixel-perfect config pick

**Regression Threshold**:
The maximum acceptable visual difference from an approved migrated baseline during later refinement.
_Avoid_: reusing source-fidelity thresholds

## Relationships

- A **Guided Migration Flow** uses one or more user approval checkpoints.
- A **Migration Start** produces the first reviewable inventory before implementation begins.
- A **Migration Start** does not generate migrated Next.js implementation code before the user approves the first reviewable inventory.
- A **Component-First Migration** verifies components before pages are assembled from them.
- A **Component Inventory Review** provides evidence for approving or correcting the initial component split.
- A **Component Inventory Review** is generated from **Raw Discovery Evidence** and draft inventory state.
- **Raw Discovery Evidence** remains immutable; **Chat-Driven Correction** modifies draft inventory state, not raw evidence.
- Code generation and Storybook read from the **Approved Component Inventory**, not directly from raw discovery clusters.
- A **Component Inventory Review** uses **Component Reference Screenshots** for grouping decisions.
- A **Component Inventory Review** stores every discovered section instance but initially shows a capped sample per group with an option to reveal hidden instances.
- A **Section Instance ID** is the correction currency for **Chat-Driven Correction**.
- An **Implementation Component Name** must be semantic and must not contain a **Section Instance ID** or component tracking ID.
- Tracking IDs may appear in migration metadata and optional generated source comments, but not in component symbols or filenames.
- **Component Inventory Review** approval is blocked while any **Implementation Component Name** is generic or ID-like.
- Each approved component variant produces a **Component Story** before page assembly.
- A **Shared Shell Component** may have **Component Stories** for implementation and manual inspection, but it does not require isolated visual-diff verification.
- A **Guided Migration Flow** establishes a **Design System Foundation** before the main component implementation pass.
- A **Static Migration Build** should use named tokens from the **Design System Foundation** rather than generating repeated arbitrary Tailwind values for common colors, radii, spacing, and fonts.
- **Visual Parity Refinement** happens after the **Design System Foundation**, **Static Migration Build**, required site content, and required behavior are in place.
- **Component Visual Verification** uses a **Perceptual Verification Metric** as the primary readiness signal once available; **Pixel Diff Diagnostic** output remains useful for debugging and review.
- Every approved component receives an **Interaction Class** before final review.
- `static` components have no source-observed behavior beyond navigation.
- `css-state` components rely on CSS states such as hover, focus, active, pressed, or open states that do not require client-side state.
- `client-state` components require local React state or browser effects, such as menus, carousels, tabs, accordions, filters, dialogs, or drawers.
- `form-integration` components require submit behavior, validation, server actions, API calls, or third-party service integration.
- `motion` components require time-based or scroll-triggered source behavior, such as marquees, reveal animations, autoplaying media, or source animation timelines.
- The **Interactive Behavior Pass** verifies representative behavior states with browser automation before final **Visual Parity Refinement**.
- **Component Visual Verification** is **Browser-Bound Verification** and must not assume unlimited parallel execution.
- **Browser-Bound Verification** runs through a **Browser Work Queue**, defaulting to one concurrent browser job.
- **Component Batches** are ordered by migration leverage: shared layout components, high-reuse components, then unique or low-reuse components.
- A **Migration Scheduler** replaces user-facing roadmap approval; users approve visual checkpoints rather than an abstract build plan.
- An **Approval Record** is the source of truth for user approval checkpoints.
- An **Approval Record** references the approved artifact version or hash and becomes stale when that artifact changes.
- An **Approved Baseline** is captured from approved migrated component or page states and protects later refinement work from regressions.
- Source reference screenshots define the target; **Approved Baselines** define the last user-approved migrated state.
- A **Regression Threshold** is stricter than a source-fidelity **Verification Threshold**; v1 starts with 0.1% for approved baseline checks.
- A passing **Component Visual Verification** makes a **Component Batch** ready for **Component Approval**, but does not replace user approval.
- A **Pending Component Batch** may be generated or verified while the user reviews another batch, but it cannot overwrite approved components or trigger page layout assembly.
- A rejected or corrected **Component Batch** invalidates dependent **Pending Component Batches** while preserving independent pending work.
- A **Page Reference Screenshot** is captured during **Migration Start** but used later for layout refinement.
- **Page Layout Assembly** begins for a page only after all components required by that page have **Component Approval**.
- **Page Layout Assembly** reports full-page pixel diffs as diagnostics against **Page Reference Screenshots** across the **Reference Viewport Set** while the readiness gate moves toward a **Perceptual Verification Metric**.
- **Shared Shell Components** are visually validated in context during **Page Layout Assembly**, not through isolated placeholder comparisons.
- A **Reference Viewport Set** applies to both **Component Reference Screenshots** and **Page Reference Screenshots**.
- A **Chat-Driven Correction** updates the **Component Inventory Review** without requiring editable UI state.
- A **Natural-Language Approval Action** is the primary control surface for corrections and approvals; slash commands are fallback or recovery tools.
- A **Recovery Tool** may exist for advanced manual repair, but it should not add confusion to the normal command list.
- A **Visual Fidelity Target** is evaluated late through **Visual Parity Refinement**, not by forcing the first build to chase a raw pixel threshold.
- An **Interactive Behavior Pass** must happen before final **Visual Parity Refinement** when any component is classified as `client-state`, `form-integration`, or `motion`.

## Example Dialogue

> **Dev:** "Should the wizard ask for attended, unattended, wireframe, or pixel-perfect?"
> **Domain expert:** "No. v1 has one **Guided Migration Flow** with a production **Visual Fidelity Target**."
> **Dev:** "Should `/migrate:new` only initialize files?"
> **Domain expert:** "No. **Migration Start** should initialize the migration and gather the first reviewable inventory."
> **Dev:** "Should the user edit component groups directly in a web UI?"
> **Domain expert:** "Not for v1. The **Component Inventory Review** is read-only; corrections are requested through the model."

## Flagged Ambiguities

- "unattended mode" and "attended mode" previously described execution modes; resolved: v1 exposes only the **Guided Migration Flow**.
- "pixel-perfect" and "wireframe" previously described user-selected goals; resolved: v1 has one production **Visual Fidelity Target**, with thresholds treated as verification settings.
- "move groups around" previously implied an editable review UI; resolved: v1 uses **Chat-Driven Correction** against a read-only **Component Inventory Review**.
- "component id" could mean either tracking metadata or implementation naming; resolved: IDs stay in metadata and may appear in comments, but not in generated component symbols or file names.
- Generic generated names such as `Component1` are not acceptable approved **Implementation Component Names**.
- "visual verification" previously implied a raw pixelmatch gate; resolved: raw pixel diffs are diagnostics, while the target readiness model should move to perceptual or DOM-aware similarity.
- "interactive component" should not be a boolean; resolved: classify components as `static`, `css-state`, `client-state`, `form-integration`, or `motion`, then verify required states before final visual refinement.
