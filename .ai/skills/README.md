# Skills

This directory holds the canonical skill set for this repo. Every supported agent (Claude Code, Codex, Cursor) discovers it via a symlink:

- `.claude/skills` → `../.ai/skills`
- `.agents/skills` → `../.ai/skills`
- `.cursor/skills` → `../.ai/skills`

Skill format is the [Anthropic Agent Skill (`SKILL.md`)](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) standard.

## Vendored skills

The skills below are vendored from [obra/superpowers](https://github.com/obra/superpowers) v5.0.7, MIT-licensed (see `LICENSE.superpowers`). Copyright (c) 2025 Jesse Vincent. To bump the version:

```bash
SP_VER=5.x.x

# If you have the global plugin installed, copy from its cache:
cp -r ~/.claude/plugins/cache/claude-plugins-official/superpowers/$SP_VER/skills/. .ai/skills/
cp ~/.claude/plugins/cache/claude-plugins-official/superpowers/$SP_VER/LICENSE .ai/skills/LICENSE.superpowers

# Otherwise, clone the upstream repo and copy from there:
git clone --depth 1 --branch v$SP_VER https://github.com/obra/superpowers /tmp/superpowers
cp -r /tmp/superpowers/skills/. .ai/skills/
cp /tmp/superpowers/LICENSE .ai/skills/LICENSE.superpowers

# Update the version pin above and verify by running a smoke test in a fresh session.
```

Vendored skills (v5.0.7):

- `brainstorming/`
- `dispatching-parallel-agents/`
- `executing-plans/`
- `finishing-a-development-branch/`
- `receiving-code-review/`
- `requesting-code-review/`
- `subagent-driven-development/`
- `systematic-debugging/`
- `test-driven-development/`
- `using-git-worktrees/`
- `using-superpowers/`
- `verification-before-completion/`
- `writing-plans/`
- `writing-skills/`

## Project-local skills

Project-specific skills live alongside the vendored ones in this directory. To create one, drop a `<skill-name>/SKILL.md` here following the [Anthropic SKILL.md format](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview).

Personal / per-developer skills should be gitignored — add the path to your repo's `.gitignore` (e.g. `.ai/skills/<my-personal-skill>/`) so it doesn't ship to teammates.

## Why a vendored copy

The global `superpowers` plugin is disabled at the project level via `.claude/settings.json` (`enabledPlugins.superpowers@claude-plugins-official: false`) so the vendored copy is the only set of skills active when working in this repo. This makes the agent harness reproducible: clone the repo, you get the same skill set, no "did you install the plugin globally" failure mode.

## Path patches

The vendored superpowers skills assume their default path conventions write to `docs/superpowers/`. We patch them on vendor to redirect outputs:

- `docs/superpowers/specs/` → `.ai/research/`
- `docs/superpowers/plans/` → `.ai/plans/`
- `docs/superpowers/` → `.ai/`

Re-apply these substitutions on every bump (the bump command above is verbatim copy; follow it with the patches below):

```bash
for f in \
  .ai/skills/brainstorming/spec-document-reviewer-prompt.md \
  .ai/skills/brainstorming/SKILL.md \
  .ai/skills/writing-plans/SKILL.md \
  .ai/skills/requesting-code-review/SKILL.md \
  .ai/skills/subagent-driven-development/SKILL.md; do
  sed -i '' \
    -e 's|docs/superpowers/specs/|.ai/research/|g' \
    -e 's|docs/superpowers/plans/|.ai/plans/|g' \
    -e 's|docs/superpowers/|.ai/|g' \
    "$f"
done
```
