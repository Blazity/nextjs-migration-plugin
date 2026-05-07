# Recovery Entry Points

The normal migration workflow is the guided approval flow exposed through `/migrate:new`, `/migrate:continue`, `/migrate:status`, and `/migrate:help`.

Legacy phase libraries remain runnable for maintainer recovery and debugging:

- `lib/discover.ts`
- `lib/analyze.ts`
- `lib/plan.ts`
- `lib/extract.ts`
- `lib/build.ts`
- `lib/polish.ts`

These files are not slash commands. Run them only with an explicit `--target <dir>` against a migration workspace whose state you intend to inspect or repair.

Recovery-specific tests under `test/recovery` are skipped by default. Run them explicitly with:

```bash
RECOVERY_TESTS=1 pnpm exec vitest run test/recovery
```
