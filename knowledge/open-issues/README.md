# Open issues — plugin-side bugs surfaced by real-world runs

Running registry of plugin defects observed during phase runs against real sites. Site-specific quirks belong in the user's `.migration/findings/`; entries here are bugs in the plugin's scripts/lib that need fixing in the plugin codebase.

One issue per file. Filename pattern: `NNN-<kebab-name>.md`.

## Index

| ID | Title | Surfaced by | Severity | Status |
|---|---|---|---|---|
| [001](./001-spa-flow-misclassified.md) | SPA_FLOW_EXTRACTION misclassified on statically-rendered pages | Phase 1 | High | Open |
| [002](./002-duplicate-redirect-urls.md) | Duplicate URL entries from un-resolved redirects | Phase 1 | Medium | Open |
| [003](./003-layout-extractor-too-strict.md) | layout-extractor heuristic too strict — misses semantic layouts behind generic wrappers | Phase 2 | Medium | Open |
| [004](./004-mega-cluster-shallow-shingles.md) | Mega-clusters from shallow path-shingles on body-level sections | Phase 2 | High | Resolved (f693326) |

## How to use this folder

- **One file per issue.** Filename: `NNN-<kebab-slug>.md` where `NNN` is the next zero-padded sequence number. Look at the highest existing number and increment.
- **Required sections per file:** **Surfaced by**, **Severity**, **Status**, **Evidence pattern**, **Root cause**, **Proposed fix**, **Action items**.
- **Status values:** `Open`, `In progress`, `Resolved (commit-sha)`, `Won't fix (rationale)`.
- **Resolved issues stay** in this folder — do not delete. Future phases may regress.
- **Update the index above** whenever a file is added, retitled, or status changes.
- **Site-specific quirks** (a particular CMS's weird DOM, a single page's odd behavior) do NOT belong here. Those go in the user project's `.migration/findings/` and, if they generalize, get distilled into `knowledge/phase-pitfalls/<phase>.md`.
- **Plugin bugs that affect any user project** belong here.
