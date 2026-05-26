# Changelog

## 0.3.0 - 2026-05-26

- Detect host project App Router root (`src/app` vs `app`) so Design System Foundation emits `globals.css` next to the layout that actually renders, components land beside their stories, and Storybook's preview imports the right stylesheet.
- Emit `--font-heading` / `--font-display` tokens, `@font-face` blocks, and font smoothing + feature-settings declarations in generated `globals.css` for closer typographic parity with the source site.
- Enrich the generated component index and improve copy, image, and font extraction across `scripts/generate-jsx`, `scripts/lib/extract-styles-core`, and component implementation runners.

## 0.2.0 - 2026-05-25

- Bump plugin metadata so Claude Code installs a fresh marketplace cache for the Storybook 10 scaffold fix.
- Add generated Storybook reference overlay support, with migrated component stories carrying source section reference metadata.
- Keep screenshot similarity checks, pixel diff diagnostics, and reference screenshot paths available during component batch verification.
