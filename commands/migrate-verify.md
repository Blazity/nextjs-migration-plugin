---
name: migrate:verify
description: Re-run the verification gate for the current phase (or a specific phase).
arguments:
  - name: phase
    description: Optional phase id, e.g., "phase-1-discover". Defaults to first incomplete phase in active run.
    required: false
---

Invoke the `migrate-verify` skill.
