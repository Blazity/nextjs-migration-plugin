---
name: migrate:new
description: Start a new Next.js migration — wizard intake, scaffolds .migration/.
arguments:
  - name: url
    description: The source URL to migrate (required).
    required: true
  - name: --source-repo
    description: Optional path to the source site's code repository.
---

Invoke the `migrate-new` skill with the provided URL.
