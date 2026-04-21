---
name: migrate-config
description: Update a single config key in SITE.md.
---

# /migrate:config <key> <value>

Update a single config value. Valid keys: `mode`, `goal`, `inputMode`, `sourceRepo`, `maxParallelPages`, `maxParallelSections`.

## Step 1 — Invoke

```bash
tsx ${PLUGIN_DIR}/lib/config.ts --target "${PWD}" --key "${KEY}" --value "${VALUE}"
```

## Step 2 — Report

On success: "Updated: [key] = [value]"
On failure: surface the validation error verbatim.
