---
name: migrate-config
description: Advanced recovery command for updating a supported SITE.md setting.
---

# /migrate:config <key> <value>

Update a single advanced config value. Valid keys: `inputMode`, `sourceRepo`, `initialPageSelection`, `maxParallelPages`, `maxParallelSections`.

## Step 1 — Invoke

```bash
tsx ${PLUGIN_DIR}/lib/config.ts --target "${PWD}" --key "${KEY}" --value "${VALUE}"
```

## Step 2 — Report

On success: "Updated: [key] = [value]"
On failure: surface the validation error verbatim.
