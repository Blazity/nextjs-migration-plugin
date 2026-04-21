---
name: migrate:config
description: Update a config value in .migration/SITE.md (mode, goal, parallelism).
arguments:
  - name: key
    required: true
  - name: value
    required: true
---

Invoke the `migrate-config` skill with (key, value).
