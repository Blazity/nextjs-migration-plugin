# nextjs-migration-plugin Vocabulary

Use these terms consistently in code, docs, prompts, and plans. If a new stable concept appears, add it here in the same change that introduces it.

## Core Concepts

| Term | Meaning | Don't Say |
| --- | --- | --- |
| **Plugin** | This Claude Code plugin repository and installable package. | agent repo, harness |
| **Source URL** | The public website URL being migrated. | origin URL, input site |
| **Source repo** | Optional read-only local repository for the original site. | old repo, legacy repo |
| **Target** | The Next.js project directory receiving generated output. | destination, output app |
| **Migration state** | The `.migration/` directory in the user's target project. | workspace state, plugin state |
| **Run** | A scoped unit of migration work under `.migration/runs/`. | job, session |
| **Phase** | One ordered step in the migration workflow, such as Discover or Build. | stage, step |
| **Verification gate** | The check that decides whether a phase is complete. | validation step, quality gate |
| **Delta run** | A later run that adds or updates pages while preserving existing library state. | incremental job, rerun |
| **Polish** | Opt-in visual, animation, and performance refinement after the build phase. | cleanup, final pass |

## Artifacts

| Term | Meaning | Don't Say |
| --- | --- | --- |
| **Adapter** | JSON platform knowledge used to detect, crawl, extract, and normalize a source site. | connector, scraper config |
| **Library** | Shared migration model under `.migration/library/`. | registry folder, component store |
| **Component registry** | `.migration/library/components.json`, the canonical component inventory. | components list |
| **Layout registry** | `.migration/library/layouts.json`, the canonical shared shell inventory. | layout list |
| **Route map** | `.migration/library/routes.json`, the source-URL to Next.js route mapping. | routing table |
| **Page slug** | Stable filesystem-safe identifier for a migrated page. | page name, route id |
| **Extraction spec** | Per-page extracted styles, images, animations, and structure under `pages/[slug]/spec/`. | generated docs, page dump |
| **Baseline** | Last verified screenshot/artifact used for regression checks. | golden, snapshot |
| **Visual diff** | Difference output from visual verification. | screenshot diff, comparison |

## Documentation Surfaces

| Term | Meaning | Don't Say |
| --- | --- | --- |
| **Spec** | Canonical product/design documentation under `docs/specs/`. | plan, task doc |
| **Plan** | Implementation plan under `.ai/plans/`. | spec, roadmap |
| **Research** | Date-prefixed investigation artifact under `.ai/research/`. | notes, scratchpad |
| **Runtime knowledge** | Plugin-shipped lessons and phase pitfalls under `knowledge/`. | memory |
| **Team memory** | Maintainer-facing durable agent context under `.ai/memory/`. | runtime knowledge |

## Forbidden

- "Destination" for the generated app; say **target**.
- "Step" for one of the eight migration phases; say **phase** unless referring to a task inside a plan.
- "Golden" for regression images; say **baseline**.
