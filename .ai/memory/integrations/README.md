# Integrations

External systems `nextjs-migration-plugin` depends on or integrates with. One file per system. Document what we use it for, how it's configured, and what failure modes look like so a new contributor or agent can debug or replicate the setup without reverse-engineering it from config files.

## Index

There are no shared external integrations documented yet. Skip user-local tooling such as personal MCP servers or locally installed CLIs; anything documented here should be true for any contributor cloning the repo.

## Format

For each integration:

1. **What it is + why we use it.**
2. **Configuration** — where the config lives, what's in it, what's local-only vs committed.
3. **How agents interact with it** (if applicable) — MCP servers, CLI tools, auth setup.
4. **Failure modes** — common breakages and how to recognize them.
5. **Cross-refs.**
