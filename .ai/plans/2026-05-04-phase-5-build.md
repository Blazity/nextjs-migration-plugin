# Phase 5 Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement runtime Phase 5 (Build) end-to-end so that, after a verified Phase 4, `/migrate:continue` (or the explicit `/migrate:build`) reads `library/components.json` + `library/routes.json` + per-page specs from `pages/<slug>/spec/`, generates TSX components and Next.js App Router page files into the user's `<target>/src/`, copies staged image binaries into `<target>/public/`, runs `next build` in the target, and gates the phase on a successful build plus the vendored `verify-build-baseline.ts` script passing at 1440px against the homepage.

**Architecture:** Plan 6 follows the dual-layer pattern Plans 2-5 established. The lib layer is fully deterministic for `goal: wireframe` — it shells out to the vendored `scripts/generate-jsx.ts` (already produces TSX per section sidecar) and assembles the per-section TSX into Next.js App Router pages. Component deduplication is honored by routing every section that belongs to a cluster through a single component file under `<target>/src/components/<Name>.tsx`. Routes from `library/routes.json` are grouped by `nextRoute`: each unique route shape produces exactly one `app/<route>/page.tsx` template; dynamic routes emit a `generateStaticParams` populated from the source URLs that share the route. Layouts come from `library/layouts.json` — when present they emit a `src/app/layout.tsx`; otherwise the orchestrator hard-fails the project-scaffold check unless the user already has one. Asset binaries staged by Phase 4 (in `pages/<slug>/_staging/public/images/<domain>/<page>/`) are flat-copied into `<target>/public/images/<domain>/`. After codegen the orchestrator runs `next build` in `<target>` and then `verify-build-baseline.ts` against the dev server. Per spec § 14 the vendored scripts are NOT modified; the runner adapts to their existing CLI conventions.

**Tech Stack:** TypeScript, Zod, Vitest, Node ≥22, pnpm (auto-detected via lockfile presence; falls back to `npm`), Next.js 15+ (user-provided in `<target>`), Playwright (already installed for verify-build-baseline). Markdown for skills/agents/knowledge. Shell-invokable via `tsx`. No new external dependencies in the plugin.

**Execution context:** All paths relative to `nextjs-migration-plugin/` repo root. Per Plan 3+ convention, no version tag is introduced. Per-page codegen is fast (~50-200ms per page once specs are read) and runs in-process; the heavy work is `next build` itself (single subprocess at the end, dominates wall-clock). Phase 5 is parallel-by-page for codegen but serial for `next build` (one build per `<target>`). Tests use stub-injection for the codegen subprocess + the `next build` subprocess + the verify-baseline subprocess; one integration test exercises the orchestrator end-to-end with all three stubbed and asserts the produced file tree matches expectations.

**Spec source:** `docs/specs/2026-04-21-migration-plugin-design.md` § 5 row 5 (Phase 5 — Build), § 9 (`/migrate:build`), § 10 (`page-builder` agent), § 12 (parallelism), § 14 (vendored scripts policy).

**Predecessors:**
- `.ai/plans/2026-04-21-plugin-foundation.md` (executed, tagged `v0.0.1`)
- `.ai/plans/2026-04-29-phase-1-discover.md` (executed, tagged `v0.0.2`)
- `.ai/plans/2026-04-30-phase-2-analyze.md` (executed)
- `.ai/plans/2026-05-01-phase-3-plan.md` (executed)
- `.ai/plans/2026-05-01-phase-4-extract.md` (executed)

**Out of scope (deferred):**
- Phase 6/7/8 polish phases (visual regression, animation, performance) — Plan 7+. Phase 5's gate verifies *one* page (the homepage) at 1440px against the source. Per-page pixel-perfect coverage at all 4 viewports is Phase 6's job.
- LLM-driven TSX refinement / pixel-perfect codegen via the `page-builder` agent. The agent prompt ships in this plan (per spec § 10) but is invoked only by the optional `/migrate:build --refine` flow, which is documented but not implemented in v1. Wireframe codegen via `generate-jsx.ts` is sufficient for the gate.
- `/migrate:add-pages` delta-mode build — Plan 7+. Delta builds reuse the library and only generate TSX for *new* pages; the visual-regression sub-gate from spec § 6 is Phase 6's domain.
- Pixel-perfect `goal` flow that auto-dispatches `/migrate:polish --all` after Phase 5 completes — Plan 7+ wires that handoff.
- Modification of vendored `generate-jsx.ts`, `verify-build-baseline.ts`, `phase-guardrails.ts`, `structure-snapshot.ts`. Per spec § 14 they are vendored verbatim. The wrapper layer adapts.

---

## File structure (what this plan produces)

```
nextjs-migration-plugin/
├── schemas/
│   └── build-manifest.ts                       # NEW — BuildManifestSchema (catalog of generated files)
├── lib/
│   ├── load-build-manifest.ts                  # NEW
│   ├── project-scaffold.ts                     # NEW — pure: validates target has package.json + src/app/layout.tsx (or none)
│   ├── asset-copier.ts                         # NEW — copies pages/<slug>/_staging/public/images/<domain>/<page>/ → <target>/public/images/<domain>/
│   ├── jsx-generator-runner.ts                 # NEW — subprocess wrapper for scripts/generate-jsx.ts
│   ├── component-tsx-emitter.ts                # NEW — pure: section TSX + cluster id → <target>/src/components/<Name>.tsx file plan
│   ├── page-assembler.ts                       # NEW — pure: route group + section refs → app/<route>/page.tsx string
│   ├── layout-assembler.ts                     # NEW — pure: layouts.json shells → src/app/layout.tsx string
│   ├── next-build-runner.ts                    # NEW — subprocess wrapper for `next build`
│   ├── verify-build-baseline-runner.ts         # NEW — subprocess wrapper for scripts/verify-build-baseline.ts
│   ├── build.ts                                # NEW — Phase 5 orchestrator + CLI shim
│   └── continue.ts                             # MODIFIED — register phase-5-build dispatcher
├── commands/
│   └── migrate-build.md                        # NEW
├── skills/
│   ├── migrate-build/SKILL.md                  # NEW
│   └── migrate-continue/SKILL.md               # MODIFIED — add phase-5 routing row
├── agents/
│   └── page-builder.md                         # NEW (used by `/migrate:build --refine`; not on the hot path)
├── knowledge/phase-pitfalls/
│   └── build.md                                # NEW
└── test/
    ├── build-manifest-schema.test.ts           # NEW
    ├── load-build-manifest.test.ts             # NEW
    ├── project-scaffold.test.ts                # NEW
    ├── asset-copier.test.ts                    # NEW
    ├── jsx-generator-runner.test.ts            # NEW (stub-injected)
    ├── component-tsx-emitter.test.ts           # NEW
    ├── page-assembler.test.ts                  # NEW
    ├── layout-assembler.test.ts                # NEW
    ├── next-build-runner.test.ts               # NEW (stub-injected)
    ├── verify-build-baseline-runner.test.ts    # NEW (stub-injected)
    ├── build.test.ts                           # NEW (orchestrator with all three subprocess runners stubbed)
    ├── continue-build.integration.test.ts      # NEW
    └── fixtures/
        ├── build-manifest-valid.json           # NEW
        ├── build-manifest-invalid.json         # NEW
        └── target-scaffold/                    # NEW — minimal Next.js project scaffold for orchestrator tests
            ├── package.json
            └── src/app/layout.tsx
```

Each file has a single responsibility. Schemas define data shape. Loaders parse + validate. Pure assemblers/emitters are unit-tested without I/O. Subprocess runners shell out and are stub-injected in tests. The orchestrator (`build.ts`) wires everything with bounded-concurrency codegen + a single serial `next build`.

---

## Conventions used in this plan

- **Per-page input dir:** `.migration/pages/<slug>/spec/` (Phase 4 output, canonical per spec § 4). Per-section sidecars are `NN-<label>.styles.json` and `NN-<label>.structure.md`. Globals at `00-globals.json`. Phase 4's `_staging/public/images/<domain>/<page>/` holds binaries.
- **Target output dirs:** Components at `<target>/src/components/<ComponentName>.tsx` (one per `library/components.json[].id`). Pages at `<target>/src/app/<route>/page.tsx` (one per unique `library/routes.json[].nextRoute`). Static images at `<target>/public/images/<domain>/<page>/<file>` (flat-copied from staging).
- **Component naming:** From `library/components.json[].name` (Phase 2 LLM-refined name). Sanitized: PascalCase, ASCII-only, falls back to `Component<Index>` if name is empty/invalid.
- **Route grouping:** Routes are grouped by exact `nextRoute` string. For each group with `kind === "static"` (length 1), emit `app/<nextRoute>/page.tsx` directly. For `kind === "dynamic"` (length ≥ 2), emit one `app/<nextRoute>/page.tsx` template that reads the slug param and switches over the source URLs to load each page's section list at build time, plus `generateStaticParams` returning every group member's `params`.
- **Phase artifacts under** `runs/<runDir>/phase-5-build/`:
  ```
  PLAN.md
  EXECUTION.md
  VERIFICATION.md           # only on gate pass
  verification.json         # always
  build/
  ├── manifest.json         # what got written: components[], pages[], assets[]
  └── failures.json         # only if codegen or build failed
  ```
- **Gate criteria (per spec § 5 row 5):**
  1. Project scaffold check passes (`<target>/package.json` exists, `<target>/src/app/layout.tsx` exists OR layouts.json provides one)
  2. Every component in `library/components.json` has a written `<target>/src/components/<Name>.tsx` file
  3. Every unique route in `library/routes.json` has a written `<target>/src/app/<route>/page.tsx` file
  4. `next build` exits 0 in `<target>`
  5. `verify-build-baseline.ts` exits 0 against `localhost:3000/` vs the homepage source URL at 1440px
- **Stub injection:** `build.ts` accepts `runJsxGenerator?`, `runNextBuild?`, `runVerifyBaseline?`, `copyAssets?`, `scaffoldCheck?` callables for testability. Defaults shell out / hit disk.
- **Package manager detection:** if `<target>/pnpm-lock.yaml` exists → `pnpm`. Else if `yarn.lock` → `yarn`. Else default `npm`. The runner invokes `<pm> --dir <target> build` (or `<pm> build` after `cd`). This is encapsulated in `next-build-runner.ts`.

---

## Task 1: Build-manifest schema — failing test + fixtures

**Files:**
- Create: `test/fixtures/build-manifest-valid.json`
- Create: `test/fixtures/build-manifest-invalid.json`
- Create: `test/build-manifest-schema.test.ts`

- [ ] **Step 1: Create fixtures**

`test/fixtures/build-manifest-valid.json`:
```json
{
  "generatedAt": "2026-05-04T12:00:00.000Z",
  "components": [
    { "id": "cluster-hero", "name": "PageHero", "filePath": "src/components/PageHero.tsx", "memberCount": 4 }
  ],
  "pages": [
    { "sourceUrl": "https://example.com/", "nextRoute": "/", "filePath": "src/app/page.tsx" }
  ],
  "assets": [
    { "from": "pages/home/_staging/public/images/example.com/home/01-hero/logo-abc.png", "to": "public/images/example.com/home/01-hero/logo-abc.png" }
  ]
}
```

`test/fixtures/build-manifest-invalid.json` (missing required `generatedAt`):
```json
{
  "components": [],
  "pages": [],
  "assets": []
}
```

- [ ] **Step 2: Write failing test**

`test/build-manifest-schema.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BuildManifestSchema } from "../schemas/build-manifest.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("BuildManifestSchema", () => {
  it("accepts a valid manifest", () => {
    const data = JSON.parse(readFileSync(fixturePath("build-manifest-valid.json"), "utf8"));
    const result = BuildManifestSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("rejects when generatedAt is missing", () => {
    const data = JSON.parse(readFileSync(fixturePath("build-manifest-invalid.json"), "utf8"));
    const result = BuildManifestSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 3: Run test, expect FAIL**

Run: `npx vitest run test/build-manifest-schema.test.ts`
Expected: FAIL with `Cannot find module '../schemas/build-manifest.ts'`.

- [ ] **Step 4: Implement schema**

`schemas/build-manifest.ts`:
```ts
import { z } from "zod";

export const BuildComponentEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  filePath: z.string().min(1),
  memberCount: z.number().int().nonnegative(),
});

export const BuildPageEntrySchema = z.object({
  sourceUrl: z.string().url(),
  nextRoute: z.string().min(1),
  filePath: z.string().min(1),
});

export const BuildAssetEntrySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

export const BuildManifestSchema = z.object({
  generatedAt: z.string().datetime(),
  components: z.array(BuildComponentEntrySchema),
  pages: z.array(BuildPageEntrySchema),
  assets: z.array(BuildAssetEntrySchema),
});

export type BuildManifest = z.infer<typeof BuildManifestSchema>;
```

- [ ] **Step 5: Run test, expect PASS**

Run: `npx vitest run test/build-manifest-schema.test.ts`
Expected: PASS, 2/2.

- [ ] **Step 6: Commit**

```bash
git add schemas/build-manifest.ts test/build-manifest-schema.test.ts test/fixtures/build-manifest-valid.json test/fixtures/build-manifest-invalid.json
git commit -m "feat(plugin): add BuildManifestSchema for Phase 5 outputs"
```

---

## Task 2: BuildManifest loader

**Files:**
- Create: `test/load-build-manifest.test.ts`
- Create: `lib/load-build-manifest.ts`

- [ ] **Step 1: Write failing test**

`test/load-build-manifest.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadBuildManifest } from "../lib/load-build-manifest.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadBuildManifest", () => {
  it("returns valid result for a schema-valid file", () => {
    const result = loadBuildManifest(fixturePath("build-manifest-valid.json"));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.components).toHaveLength(1);
  });

  it("returns invalid result for a schema-invalid file", () => {
    const result = loadBuildManifest(fixturePath("build-manifest-invalid.json"));
    expect(result.valid).toBe(false);
  });

  it("returns invalid result for a missing file", () => {
    const result = loadBuildManifest("/nope/missing.json");
    expect(result.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/load-build-manifest.test.ts`
Expected: FAIL with `Cannot find module`.

- [ ] **Step 3: Implement loader**

`lib/load-build-manifest.ts`:
```ts
import { readFileSync } from "node:fs";
import { BuildManifestSchema, type BuildManifest } from "../schemas/build-manifest.ts";
import type { LoadResult } from "../schemas/errors.ts";

export function loadBuildManifest(path: string): LoadResult<BuildManifest> {
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return {
      valid: false,
      path,
      rawJson: null,
      issues: [{ code: "custom", path: [], message: `Failed to parse JSON: ${(err as Error).message}` }],
    };
  }
  const result = BuildManifestSchema.safeParse(rawJson);
  if (result.success) return { valid: true, data: result.data };
  return { valid: false, path, rawJson, issues: result.error.issues };
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npx vitest run test/load-build-manifest.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add lib/load-build-manifest.ts test/load-build-manifest.test.ts
git commit -m "feat(plugin): add loadBuildManifest"
```

---

## Task 3: Project-scaffold check

**Files:**
- Create: `test/project-scaffold.test.ts`
- Create: `lib/project-scaffold.ts`
- Create: `test/fixtures/target-scaffold/package.json`
- Create: `test/fixtures/target-scaffold/src/app/layout.tsx`

- [ ] **Step 1: Create scaffold fixture**

`test/fixtures/target-scaffold/package.json`:
```json
{
  "name": "scaffold-fixture",
  "private": true,
  "scripts": { "build": "next build" },
  "dependencies": { "next": "15.0.0", "react": "19.0.0", "react-dom": "19.0.0" }
}
```

`test/fixtures/target-scaffold/src/app/layout.tsx`:
```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html><body>{children}</body></html>;
}
```

- [ ] **Step 2: Write failing test**

`test/project-scaffold.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkProjectScaffold } from "../lib/project-scaffold.ts";

const scaffoldFixture = fileURLToPath(new URL("./fixtures/target-scaffold/", import.meta.url));

describe("checkProjectScaffold", () => {
  it("passes when package.json + src/app/layout.tsx exist", () => {
    const result = checkProjectScaffold(scaffoldFixture);
    expect(result.ok).toBe(true);
  });

  it("fails when package.json is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "scaffold-"));
    mkdirSync(join(dir, "src/app"), { recursive: true });
    writeFileSync(join(dir, "src/app/layout.tsx"), "");
    const result = checkProjectScaffold(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toContain("package.json");
  });

  it("fails when src/app/layout.tsx is missing AND layouts.json is empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "scaffold-"));
    writeFileSync(join(dir, "package.json"), "{}");
    const result = checkProjectScaffold(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toContain("src/app/layout.tsx");
  });
});
```

- [ ] **Step 3: Run test, expect FAIL**

Run: `npx vitest run test/project-scaffold.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 4: Implement scaffold check**

`lib/project-scaffold.ts`:
```ts
import { existsSync } from "node:fs";
import { join } from "node:path";

export type ScaffoldCheckResult =
  | { ok: true }
  | { ok: false; missing: string[] };

export function checkProjectScaffold(targetDir: string): ScaffoldCheckResult {
  const required = ["package.json", "src/app/layout.tsx"];
  const missing = required.filter(p => !existsSync(join(targetDir, p)));
  if (missing.length === 0) return { ok: true };
  return { ok: false, missing };
}
```

- [ ] **Step 5: Run test, expect PASS**

Run: `npx vitest run test/project-scaffold.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 6: Commit**

```bash
git add lib/project-scaffold.ts test/project-scaffold.test.ts test/fixtures/target-scaffold/
git commit -m "feat(plugin): add Phase 5 project-scaffold gate check"
```

---

## Task 4: Asset copier

**Files:**
- Create: `test/asset-copier.test.ts`
- Create: `lib/asset-copier.ts`

- [ ] **Step 1: Write failing test**

`test/asset-copier.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyStagedAssets } from "../lib/asset-copier.ts";

describe("copyStagedAssets", () => {
  it("flat-copies binaries from pages/<slug>/_staging/public/images/<domain>/<page>/* to <target>/public/images/<domain>/<page>/*", () => {
    const root = mkdtempSync(join(tmpdir(), "assets-"));
    const stagingRoot = join(root, ".migration/pages/home/_staging/public/images/example.com/home/01-hero");
    mkdirSync(stagingRoot, { recursive: true });
    writeFileSync(join(stagingRoot, "logo-abc.png"), "PNG-BYTES");
    const targetDir = join(root, "target");
    mkdirSync(targetDir, { recursive: true });

    const result = copyStagedAssets({
      pagesDir: join(root, ".migration/pages"),
      slugs: ["home"],
      targetDir,
    });

    expect(result.copied).toHaveLength(1);
    expect(existsSync(join(targetDir, "public/images/example.com/home/01-hero/logo-abc.png"))).toBe(true);
    expect(readFileSync(join(targetDir, "public/images/example.com/home/01-hero/logo-abc.png"), "utf8")).toBe("PNG-BYTES");
  });

  it("returns an empty list when there are no staged binaries", () => {
    const root = mkdtempSync(join(tmpdir(), "assets-"));
    mkdirSync(join(root, ".migration/pages/home"), { recursive: true });
    const targetDir = join(root, "target");
    mkdirSync(targetDir, { recursive: true });
    const result = copyStagedAssets({
      pagesDir: join(root, ".migration/pages"),
      slugs: ["home"],
      targetDir,
    });
    expect(result.copied).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/asset-copier.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement asset copier**

`lib/asset-copier.ts`:
```ts
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { join, relative } from "node:path";

export interface CopyAssetsArgs {
  pagesDir: string;
  slugs: string[];
  targetDir: string;
}

export interface CopyAssetsResult {
  copied: { from: string; to: string }[];
}

function walk(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

export function copyStagedAssets(args: CopyAssetsArgs): CopyAssetsResult {
  const copied: { from: string; to: string }[] = [];
  for (const slug of args.slugs) {
    const stagingRoot = join(args.pagesDir, slug, "_staging/public");
    if (!existsSync(stagingRoot)) continue;
    for (const src of walk(stagingRoot)) {
      const rel = relative(stagingRoot, src);
      const dst = join(args.targetDir, "public", rel);
      mkdirSync(join(dst, ".."), { recursive: true });
      copyFileSync(src, dst);
      copied.push({ from: src, to: dst });
    }
  }
  return { copied };
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npx vitest run test/asset-copier.test.ts`
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add lib/asset-copier.ts test/asset-copier.test.ts
git commit -m "feat(plugin): add Phase 5 asset copier"
```

---

## Task 5: JSX-generator subprocess runner

**Files:**
- Create: `test/jsx-generator-runner.test.ts`
- Create: `lib/jsx-generator-runner.ts`

- [ ] **Step 1: Write failing test**

`test/jsx-generator-runner.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { runJsxGeneration } from "../lib/jsx-generator-runner.ts";

describe("runJsxGeneration", () => {
  it("invokes the configured execFile with --specs-dir and --output-dir", async () => {
    const calls: { cmd: string; args: string[] }[] = [];
    const fakeExec = vi.fn(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return { stdout: "ok", stderr: "" };
    });
    await runJsxGeneration(
      { specsDir: "/spec", outputDir: "/out", pluginRoot: "/plugin" },
      { execFile: fakeExec },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0]).toBe("tsx");
    expect(calls[0].args.slice(-2)).toEqual(["/spec", "/out"]);
  });

  it("captures the wall-clock time and propagates stderr on subprocess failure", async () => {
    const fakeExec = vi.fn(async () => {
      throw new Error("subprocess died");
    });
    await expect(
      runJsxGeneration({ specsDir: "/spec", outputDir: "/out", pluginRoot: "/plugin" }, { execFile: fakeExec }),
    ).rejects.toThrow(/subprocess died/);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/jsx-generator-runner.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement runner**

`lib/jsx-generator-runner.ts`:
```ts
import { execFile as defaultExecFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

const promisifiedDefault = promisify(defaultExecFile);

export interface RunJsxGenerationArgs {
  specsDir: string;
  outputDir: string;
  pluginRoot: string;
}

export interface RunJsxGenerationDeps {
  execFile?: (cmd: string, args: string[], opts?: object) => Promise<{ stdout: string; stderr: string }>;
}

export interface RunJsxGenerationResult {
  durationMs: number;
}

const SUBPROCESS_TIMEOUT_MS = Number(process.env.BUILD_SUBPROCESS_TIMEOUT_MS ?? 120_000);

export async function runJsxGeneration(
  args: RunJsxGenerationArgs,
  deps: RunJsxGenerationDeps = {},
): Promise<RunJsxGenerationResult> {
  const exec = deps.execFile ?? promisifiedDefault;
  const script = resolve(args.pluginRoot, "scripts/generate-jsx.ts");
  const start = Date.now();
  await exec("npx", ["tsx", script, args.specsDir, args.outputDir], {
    env: process.env,
    timeout: SUBPROCESS_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
  return { durationMs: Date.now() - start };
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npx vitest run test/jsx-generator-runner.test.ts`
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add lib/jsx-generator-runner.ts test/jsx-generator-runner.test.ts
git commit -m "feat(plugin): wrap scripts/generate-jsx.ts as a stub-injectable runner"
```

---

## Task 6: Component-tsx emitter (pure)

**Files:**
- Create: `test/component-tsx-emitter.test.ts`
- Create: `lib/component-tsx-emitter.ts`

- [ ] **Step 1: Write failing test**

`test/component-tsx-emitter.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { sanitizeComponentName, planComponentFiles } from "../lib/component-tsx-emitter.ts";

describe("sanitizeComponentName", () => {
  it("PascalCases hyphens and strips non-ascii", () => {
    expect(sanitizeComponentName("page-hero")).toBe("PageHero");
    expect(sanitizeComponentName("Café Header")).toBe("CafeHeader");
  });

  it("falls back to Component<index> when input is empty or all-symbol", () => {
    expect(sanitizeComponentName("", 3)).toBe("Component3");
    expect(sanitizeComponentName("---", 7)).toBe("Component7");
  });
});

describe("planComponentFiles", () => {
  it("maps each component id to a target path under src/components/<Name>.tsx", () => {
    const plan = planComponentFiles({
      components: [
        { id: "cluster-hero", name: "page-hero", memberSections: [{ id: "p0-s0", url: "u" }, { id: "p1-s0", url: "u2" }] },
        { id: "cluster-cta", name: "", memberSections: [{ id: "p0-s5", url: "u" }] },
      ],
    });
    expect(plan).toEqual([
      { id: "cluster-hero", name: "PageHero", filePath: "src/components/PageHero.tsx", memberCount: 2 },
      { id: "cluster-cta", name: "Component1", filePath: "src/components/Component1.tsx", memberCount: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/component-tsx-emitter.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement emitter**

`lib/component-tsx-emitter.ts`:
```ts
export function sanitizeComponentName(raw: string, fallbackIndex = 0): string {
  const ascii = raw.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const parts = ascii.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length === 0) return `Component${fallbackIndex}`;
  return parts.map(p => p[0].toUpperCase() + p.slice(1)).join("");
}

export interface ComponentInput {
  id: string;
  name: string;
  memberSections: { id: string; url: string }[];
}

export interface ComponentFilePlan {
  id: string;
  name: string;
  filePath: string;
  memberCount: number;
}

export function planComponentFiles(args: { components: ComponentInput[] }): ComponentFilePlan[] {
  return args.components.map((c, i) => {
    const name = sanitizeComponentName(c.name, i);
    return {
      id: c.id,
      name,
      filePath: `src/components/${name}.tsx`,
      memberCount: c.memberSections.length,
    };
  });
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npx vitest run test/component-tsx-emitter.test.ts`
Expected: PASS, 4/4 (2 sanitize + 1 plan).

- [ ] **Step 5: Commit**

```bash
git add lib/component-tsx-emitter.ts test/component-tsx-emitter.test.ts
git commit -m "feat(plugin): add component name sanitizer + file planner"
```

---

## Task 7: Page assembler (pure) — static + dynamic routes

**Files:**
- Create: `test/page-assembler.test.ts`
- Create: `lib/page-assembler.ts`

- [ ] **Step 1: Write failing test**

`test/page-assembler.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { groupRoutesByNextRoute, assemblePageTsx } from "../lib/page-assembler.ts";

describe("groupRoutesByNextRoute", () => {
  it("collapses routes that share a nextRoute into a single group", () => {
    const groups = groupRoutesByNextRoute([
      { sourceUrl: "https://x.com/", nextRoute: "/", params: {}, kind: "static" },
      { sourceUrl: "https://x.com/blog/a", nextRoute: "/blog/[slug]", params: { slug: "a" }, kind: "dynamic" },
      { sourceUrl: "https://x.com/blog/b", nextRoute: "/blog/[slug]", params: { slug: "b" }, kind: "dynamic" },
    ]);
    expect(groups).toEqual([
      { nextRoute: "/", kind: "static", entries: [{ sourceUrl: "https://x.com/", params: {} }] },
      { nextRoute: "/blog/[slug]", kind: "dynamic", entries: [
        { sourceUrl: "https://x.com/blog/a", params: { slug: "a" } },
        { sourceUrl: "https://x.com/blog/b", params: { slug: "b" } },
      ]},
    ]);
  });
});

describe("assemblePageTsx", () => {
  it("emits a static page that imports the listed components and renders them in order", () => {
    const tsx = assemblePageTsx({
      group: { nextRoute: "/", kind: "static", entries: [{ sourceUrl: "https://x.com/", params: {} }] },
      sectionRefs: [{ componentName: "PageHero" }, { componentName: "Footer" }],
    });
    expect(tsx).toContain('import PageHero from "@/components/PageHero"');
    expect(tsx).toContain('import Footer from "@/components/Footer"');
    expect(tsx).toContain("<PageHero />");
    expect(tsx).toContain("<Footer />");
    expect(tsx).toMatch(/export default function Page\(\)/);
  });

  it("emits a dynamic page with generateStaticParams listing every group entry's params", () => {
    const tsx = assemblePageTsx({
      group: {
        nextRoute: "/blog/[slug]",
        kind: "dynamic",
        entries: [
          { sourceUrl: "https://x.com/blog/a", params: { slug: "a" } },
          { sourceUrl: "https://x.com/blog/b", params: { slug: "b" } },
        ],
      },
      sectionRefs: [{ componentName: "PageHero" }],
    });
    expect(tsx).toContain("export async function generateStaticParams()");
    expect(tsx).toContain('"slug":"a"');
    expect(tsx).toContain('"slug":"b"');
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/page-assembler.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement assembler**

`lib/page-assembler.ts`:
```ts
export interface RouteEntry {
  sourceUrl: string;
  nextRoute: string;
  params: Record<string, string>;
  kind: "static" | "dynamic";
}

export interface RouteGroup {
  nextRoute: string;
  kind: "static" | "dynamic";
  entries: { sourceUrl: string; params: Record<string, string> }[];
}

export function groupRoutesByNextRoute(routes: RouteEntry[]): RouteGroup[] {
  const map = new Map<string, RouteGroup>();
  for (const r of routes) {
    const existing = map.get(r.nextRoute);
    if (existing) {
      existing.entries.push({ sourceUrl: r.sourceUrl, params: r.params });
    } else {
      map.set(r.nextRoute, {
        nextRoute: r.nextRoute,
        kind: r.kind,
        entries: [{ sourceUrl: r.sourceUrl, params: r.params }],
      });
    }
  }
  return Array.from(map.values());
}

export interface AssemblePageArgs {
  group: RouteGroup;
  sectionRefs: { componentName: string }[];
}

export function assemblePageTsx(args: AssemblePageArgs): string {
  const uniqueImports = Array.from(new Set(args.sectionRefs.map(s => s.componentName)));
  const importLines = uniqueImports.map(n => `import ${n} from "@/components/${n}";`).join("\n");
  const renders = args.sectionRefs.map(s => `      <${s.componentName} />`).join("\n");

  if (args.group.kind === "static") {
    return `${importLines}

export default function Page() {
  return (
    <>
${renders}
    </>
  );
}
`;
  }

  const params = JSON.stringify(args.group.entries.map(e => e.params));
  return `${importLines}

export async function generateStaticParams() {
  return ${params};
}

export default function Page() {
  return (
    <>
${renders}
    </>
  );
}
`;
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npx vitest run test/page-assembler.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add lib/page-assembler.ts test/page-assembler.test.ts
git commit -m "feat(plugin): assemble Next.js App Router pages from route groups"
```

---

## Task 8: Layout assembler (pure)

**Files:**
- Create: `test/layout-assembler.test.ts`
- Create: `lib/layout-assembler.ts`

- [ ] **Step 1: Write failing test**

`test/layout-assembler.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { assembleRootLayoutTsx } from "../lib/layout-assembler.ts";

describe("assembleRootLayoutTsx", () => {
  it("returns null when no header / footer / nav layout slots are populated", () => {
    const result = assembleRootLayoutTsx({ header: null, footer: null, nav: null });
    expect(result).toBeNull();
  });

  it("emits a layout that wraps {children} between Header and Footer when both slots are populated", () => {
    const tsx = assembleRootLayoutTsx({
      header: { componentName: "SiteHeader" },
      footer: { componentName: "SiteFooter" },
      nav: null,
    });
    expect(tsx).toContain('import SiteHeader from "@/components/SiteHeader"');
    expect(tsx).toContain('import SiteFooter from "@/components/SiteFooter"');
    expect(tsx).toMatch(/<SiteHeader \/>\s*\{children\}\s*<SiteFooter \/>/);
    expect(tsx).toContain("export default function RootLayout");
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/layout-assembler.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement assembler**

`lib/layout-assembler.ts`:
```ts
export interface LayoutSlot {
  componentName: string;
}

export interface LayoutAssemblyArgs {
  header: LayoutSlot | null;
  footer: LayoutSlot | null;
  nav: LayoutSlot | null;
}

export function assembleRootLayoutTsx(args: LayoutAssemblyArgs): string | null {
  const slots = [args.header, args.nav, args.footer].filter((s): s is LayoutSlot => Boolean(s));
  if (slots.length === 0) return null;
  const imports = slots.map(s => `import ${s.componentName} from "@/components/${s.componentName}";`).join("\n");
  const headerJsx = args.header ? `<${args.header.componentName} />` : "";
  const navJsx = args.nav ? `<${args.nav.componentName} />` : "";
  const footerJsx = args.footer ? `<${args.footer.componentName} />` : "";
  return `${imports}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        ${headerJsx}${navJsx}{children}${footerJsx}
      </body>
    </html>
  );
}
`;
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npx vitest run test/layout-assembler.test.ts`
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add lib/layout-assembler.ts test/layout-assembler.test.ts
git commit -m "feat(plugin): assemble root layout from layouts.json shells"
```

---

## Task 9: next-build subprocess runner

**Files:**
- Create: `test/next-build-runner.test.ts`
- Create: `lib/next-build-runner.ts`

- [ ] **Step 1: Write failing test**

`test/next-build-runner.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runNextBuild, detectPackageManager } from "../lib/next-build-runner.ts";

describe("detectPackageManager", () => {
  it("returns pnpm when pnpm-lock.yaml exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "pm-"));
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    expect(detectPackageManager(dir)).toBe("pnpm");
  });
  it("returns yarn when yarn.lock exists and no pnpm lock", () => {
    const dir = mkdtempSync(join(tmpdir(), "pm-"));
    writeFileSync(join(dir, "yarn.lock"), "");
    expect(detectPackageManager(dir)).toBe("yarn");
  });
  it("falls back to npm when no lockfile is present", () => {
    const dir = mkdtempSync(join(tmpdir(), "pm-"));
    expect(detectPackageManager(dir)).toBe("npm");
  });
});

describe("runNextBuild", () => {
  it("invokes the configured execFile with the detected package manager and returns exitCode 0 on success", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nb-"));
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    const calls: { cmd: string; args: string[] }[] = [];
    const fakeExec = vi.fn(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return { stdout: "", stderr: "" };
    });
    const result = await runNextBuild({ targetDir: dir }, { execFile: fakeExec });
    expect(result.exitCode).toBe(0);
    expect(calls[0].cmd).toBe("pnpm");
    expect(calls[0].args).toContain("build");
  });

  it("returns exitCode 1 with stderr when the subprocess throws", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nb-"));
    const fakeExec = vi.fn(async () => {
      const err = new Error("build failed") as Error & { stderr?: string };
      err.stderr = "type error in foo.tsx";
      throw err;
    });
    const result = await runNextBuild({ targetDir: dir }, { execFile: fakeExec });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("type error");
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/next-build-runner.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement runner**

`lib/next-build-runner.ts`:
```ts
import { execFile as defaultExecFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";

const promisifiedDefault = promisify(defaultExecFile);

export type PackageManager = "pnpm" | "yarn" | "npm";

export function detectPackageManager(targetDir: string): PackageManager {
  if (existsSync(join(targetDir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(targetDir, "yarn.lock"))) return "yarn";
  return "npm";
}

export interface RunNextBuildArgs {
  targetDir: string;
}

export interface RunNextBuildDeps {
  execFile?: (cmd: string, args: string[], opts?: object) => Promise<{ stdout: string; stderr: string }>;
}

export interface RunNextBuildResult {
  exitCode: 0 | 1;
  stdout: string;
  stderr: string;
  packageManager: PackageManager;
}

const BUILD_TIMEOUT_MS = Number(process.env.NEXT_BUILD_TIMEOUT_MS ?? 600_000);

export async function runNextBuild(
  args: RunNextBuildArgs,
  deps: RunNextBuildDeps = {},
): Promise<RunNextBuildResult> {
  const exec = deps.execFile ?? promisifiedDefault;
  const pm = detectPackageManager(args.targetDir);
  const cliArgs = pm === "npm" ? ["run", "build"] : ["build"];
  try {
    const result = await exec(pm, cliArgs, {
      cwd: args.targetDir,
      env: process.env,
      timeout: BUILD_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr, packageManager: pm };
  } catch (err) {
    const e = err as Error & { stdout?: string; stderr?: string };
    return { exitCode: 1, stdout: e.stdout ?? "", stderr: e.stderr ?? e.message, packageManager: pm };
  }
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npx vitest run test/next-build-runner.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 5: Commit**

```bash
git add lib/next-build-runner.ts test/next-build-runner.test.ts
git commit -m "feat(plugin): wrap next build with package-manager detection + timeout"
```

---

## Task 10: verify-build-baseline subprocess runner

**Files:**
- Create: `test/verify-build-baseline-runner.test.ts`
- Create: `lib/verify-build-baseline-runner.ts`

- [ ] **Step 1: Write failing test**

`test/verify-build-baseline-runner.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { runVerifyBuildBaseline } from "../lib/verify-build-baseline-runner.ts";

describe("runVerifyBuildBaseline", () => {
  it("invokes the vendored script with referenceUrl, localUrl, specsDir and the adapter flag", async () => {
    const calls: string[][] = [];
    const fakeExec = vi.fn(async (_cmd: string, args: string[]) => {
      calls.push(args);
      return { stdout: "PASS", stderr: "" };
    });
    const result = await runVerifyBuildBaseline(
      {
        referenceUrl: "https://example.com/",
        localUrl: "http://localhost:3000/",
        specsDir: "/spec",
        adapterPath: "/a/webflow.json",
        pluginRoot: "/plugin",
      },
      { execFile: fakeExec },
    );
    expect(result.passed).toBe(true);
    expect(calls[0]).toContain("https://example.com/");
    expect(calls[0]).toContain("http://localhost:3000/");
    expect(calls[0]).toContain("/spec");
    expect(calls[0]).toContain("--adapter");
    expect(calls[0]).toContain("/a/webflow.json");
  });

  it("returns passed=false with detail on subprocess failure", async () => {
    const fakeExec = vi.fn(async () => {
      const err = new Error("baseline mismatch") as Error & { stderr?: string };
      err.stderr = "section 03 missing";
      throw err;
    });
    const result = await runVerifyBuildBaseline(
      {
        referenceUrl: "https://example.com/",
        localUrl: "http://localhost:3000/",
        specsDir: "/spec",
        adapterPath: "/a/webflow.json",
        pluginRoot: "/plugin",
      },
      { execFile: fakeExec },
    );
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("section 03 missing");
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/verify-build-baseline-runner.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement runner**

`lib/verify-build-baseline-runner.ts`:
```ts
import { execFile as defaultExecFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

const promisifiedDefault = promisify(defaultExecFile);

export interface RunVerifyBuildBaselineArgs {
  referenceUrl: string;
  localUrl: string;
  specsDir: string;
  adapterPath: string;
  pluginRoot: string;
}

export interface RunVerifyBuildBaselineDeps {
  execFile?: (cmd: string, args: string[], opts?: object) => Promise<{ stdout: string; stderr: string }>;
}

export interface RunVerifyBuildBaselineResult {
  passed: boolean;
  detail?: string;
}

const VERIFY_TIMEOUT_MS = Number(process.env.VERIFY_BASELINE_TIMEOUT_MS ?? 180_000);

export async function runVerifyBuildBaseline(
  args: RunVerifyBuildBaselineArgs,
  deps: RunVerifyBuildBaselineDeps = {},
): Promise<RunVerifyBuildBaselineResult> {
  const exec = deps.execFile ?? promisifiedDefault;
  const script = resolve(args.pluginRoot, "scripts/verify-build-baseline.ts");
  try {
    await exec(
      "npx",
      ["tsx", script, args.referenceUrl, args.localUrl, args.specsDir, "--adapter", args.adapterPath],
      { env: process.env, timeout: VERIFY_TIMEOUT_MS, killSignal: "SIGKILL" },
    );
    return { passed: true };
  } catch (err) {
    const e = err as Error & { stderr?: string };
    return { passed: false, detail: e.stderr ?? e.message };
  }
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npx vitest run test/verify-build-baseline-runner.test.ts`
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add lib/verify-build-baseline-runner.ts test/verify-build-baseline-runner.test.ts
git commit -m "feat(plugin): wrap scripts/verify-build-baseline.ts as a runner"
```

---

## Task 11: Build orchestrator — happy path test + skeleton

**Files:**
- Create: `test/build.test.ts`
- Create: `lib/build.ts`

- [ ] **Step 1: Write failing test (happy path)**

`test/build.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBuild } from "../lib/build.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";

const baseSite = (sourceUrl: string) => ({
  sourceUrl, target: "./",
  mode: "unattended" as const, goal: "wireframe" as const, inputMode: "url-only" as const,
  maxParallelPages: 4, maxParallelSections: 4,
});

function writePhases1to4(targetDir: string, urls: string[]) {
  const runDir = join(targetDir, ".migration/runs/001-initial");
  // Phase 1
  const p1 = join(runDir, "phase-1-discover");
  mkdirSync(join(p1, "discovery"), { recursive: true });
  writeFileSync(join(p1, "discovery/crawl.json"), JSON.stringify({
    sourceUrl: urls[0], crawledAt: new Date().toISOString(),
    limits: { maxPages: 10, maxDepth: 2 }, sitemapUrls: [],
    pages: urls.map((u, i) => ({
      url: u, slug: i === 0 ? "home" : `p${i}`, title: u, depth: i === 0 ? 0 : 1,
      discoveredVia: i === 0 ? "seed" : "link", status: 200, outboundLinks: [],
    })), errors: [],
  }));
  writeFileSync(join(p1, "discovery/probe.json"), JSON.stringify({
    probedAt: new Date().toISOString(),
    pages: urls.map(u => ({ url: u, matchedAdapters: ["/fake/adapter.json"], recommendation: "DIRECT_EXTRACTION", detectedCMP: null, isSPA: false })),
  }));
  writeFileSync(join(p1, "VERIFICATION.md"), "# verified");
  // Phase 2 library
  const lib = join(targetDir, ".migration/library");
  mkdirSync(lib, { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(join(lib, "layouts.json"), JSON.stringify({ header: null, footer: null, nav: null, updatedAt: now }));
  writeFileSync(join(lib, "components.json"), JSON.stringify({
    components: [{
      id: "cluster-x", name: "PageBody", signature: "x",
      tagSkeleton: "section",
      memberSections: urls.map((u, i) => ({ id: `p${i}-s0`, url: u })),
      unique: false, propsRef: null,
    }],
    updatedAt: now,
  }));
  writeFileSync(join(lib, "props.json"), JSON.stringify({ interfaces: [], updatedAt: now }));
  writeFileSync(join(lib, "routes.json"), JSON.stringify({
    routes: urls.map(u => ({ sourceUrl: u, nextRoute: new URL(u).pathname || "/", params: {}, kind: "static" as const })),
    updatedAt: now,
  }));
  writeFileSync(join(runDir, "phase-2-analyze/VERIFICATION.md"), "# verified");
  mkdirSync(join(runDir, "phase-2-analyze"), { recursive: true });
  // Phase 3
  const p3 = join(runDir, "phase-3-plan");
  mkdirSync(p3, { recursive: true });
  writeFileSync(join(p3, "VERIFICATION.md"), "# verified");
  writeFileSync(join(runDir, "ROADMAP.md"), "---\ngoal: wireframe\n---\n# Roadmap\n");
  // Phase 4
  const p4 = join(runDir, "phase-4-extract");
  mkdirSync(p4, { recursive: true });
  writeFileSync(join(p4, "VERIFICATION.md"), "# verified");
  for (const [i, u] of urls.entries()) {
    const slug = i === 0 ? "home" : `p${i}`;
    const specDir = join(targetDir, ".migration/pages", slug, "spec");
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, "01-section.styles.json"), "[]");
    writeFileSync(join(specDir, "01-section.structure.md"), "# section\n\n## Element Tree\n\n- div\n");
    writeFileSync(
      join(targetDir, ".migration/pages", slug, "manifest.json"),
      JSON.stringify({
        url: u, slug, extractedAt: now, viewport: { width: 1440, height: 900 },
        files: { styles: "spec/styles.json", images: "spec/images.json", animations: "spec/animations.json", structure: "spec/structure.json", globals: "spec/00-globals.json" },
        stats: { sectionCount: 1, imageCount: 0, animationCount: 0 }, errors: [],
      }),
    );
    writeFileSync(
      join(targetDir, ".migration/pages", slug, "component-usage.json"),
      JSON.stringify({ url: u, slug, components: [{ id: "cluster-x", sectionIndices: [0] }], unmatched: [] }),
    );
  }
}

function writeTargetScaffold(targetDir: string) {
  mkdirSync(join(targetDir, "src/app"), { recursive: true });
  writeFileSync(join(targetDir, "package.json"), JSON.stringify({ name: "t", scripts: { build: "next build" } }));
  writeFileSync(join(targetDir, "src/app/layout.tsx"), "export default function L({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }");
}

describe("runBuild", () => {
  it("emits component + page TSX, runs next build, and emits VERIFICATION.md when all gates pass", async () => {
    const root = mkdtempSync(join(tmpdir(), "build-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    writePhases1to4(root, ["https://example.com/", "https://example.com/about"]);
    writeTargetScaffold(root);

    await runBuild({
      targetDir: root,
      runDir: "001-initial",
      runJsxGenerator: async ({ outputDir }) => {
        mkdirSync(outputDir, { recursive: true });
        writeFileSync(join(outputDir, "01-section.tsx"), "export default function S(){ return <section/>; }");
      },
      runNextBuild: async () => ({ exitCode: 0, stdout: "ok", stderr: "", packageManager: "npm" }),
      runVerifyBuildBaseline: async () => ({ passed: true }),
    });

    const phaseDir = join(root, ".migration/runs/001-initial/phase-5-build");
    expect(existsSync(join(phaseDir, "PLAN.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "EXECUTION.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "build/manifest.json"))).toBe(true);
    expect(existsSync(join(root, "src/components/PageBody.tsx"))).toBe(true);
    expect(existsSync(join(root, "src/app/page.tsx"))).toBe(true);
    expect(existsSync(join(root, "src/app/about/page.tsx"))).toBe(true);
    const v = JSON.parse(readFileSync(join(phaseDir, "verification.json"), "utf8"));
    expect(v.passed).toBe(true);
  });

  it("does NOT emit VERIFICATION.md when next build fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "build-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    writePhases1to4(root, ["https://example.com/"]);
    writeTargetScaffold(root);

    await runBuild({
      targetDir: root,
      runDir: "001-initial",
      runJsxGenerator: async ({ outputDir }) => {
        mkdirSync(outputDir, { recursive: true });
        writeFileSync(join(outputDir, "01-section.tsx"), "");
      },
      runNextBuild: async () => ({ exitCode: 1, stdout: "", stderr: "type error", packageManager: "npm" }),
      runVerifyBuildBaseline: async () => ({ passed: true }),
    });

    const phaseDir = join(root, ".migration/runs/001-initial/phase-5-build");
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(false);
    const v = JSON.parse(readFileSync(join(phaseDir, "verification.json"), "utf8"));
    expect(v.passed).toBe(false);
    expect(v.criteria.find((c: { name: string }) => c.name.includes("next build")).passed).toBe(false);
  });

  it("does NOT emit VERIFICATION.md when scaffold check fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "build-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    writePhases1to4(root, ["https://example.com/"]);
    // intentionally skip writeTargetScaffold

    await runBuild({
      targetDir: root,
      runDir: "001-initial",
      runJsxGenerator: async () => {},
      runNextBuild: async () => ({ exitCode: 0, stdout: "", stderr: "", packageManager: "npm" }),
      runVerifyBuildBaseline: async () => ({ passed: true }),
    });

    const phaseDir = join(root, ".migration/runs/001-initial/phase-5-build");
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/build.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement orchestrator**

`lib/build.ts`:
```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSite } from "./load-site.ts";
import { loadComponents } from "./load-components.ts";
import { loadRoutes } from "./load-routes.ts";
import { loadLayouts } from "./load-layouts.ts";
import { loadProbe } from "./load-probe.ts";
import { loadCrawl } from "./load-crawl.ts";
import { loadComponentUsage } from "./load-component-usage.ts";
import { writePlan, writeExecution, writeVerification } from "./phase-state.ts";
import { checkProjectScaffold } from "./project-scaffold.ts";
import { copyStagedAssets } from "./asset-copier.ts";
import { runJsxGeneration as defaultRunJsxGen } from "./jsx-generator-runner.ts";
import { runNextBuild as defaultRunNextBuild, type RunNextBuildResult } from "./next-build-runner.ts";
import { runVerifyBuildBaseline as defaultRunVerifyBaseline, type RunVerifyBuildBaselineResult } from "./verify-build-baseline-runner.ts";
import { planComponentFiles } from "./component-tsx-emitter.ts";
import { groupRoutesByNextRoute, assemblePageTsx } from "./page-assembler.ts";
import { assembleRootLayoutTsx } from "./layout-assembler.ts";
import type { BuildManifest } from "../schemas/build-manifest.ts";

export interface RunBuildArgs {
  targetDir: string;
  runDir: string;
  pluginRoot?: string;
  runJsxGenerator?: (a: { specsDir: string; outputDir: string; pluginRoot: string }) => Promise<unknown>;
  runNextBuild?: (a: { targetDir: string }) => Promise<RunNextBuildResult>;
  runVerifyBuildBaseline?: (a: {
    referenceUrl: string; localUrl: string; specsDir: string; adapterPath: string; pluginRoot: string;
  }) => Promise<RunVerifyBuildBaselineResult>;
}

export async function runBuild(args: RunBuildArgs): Promise<void> {
  const pluginRoot = args.pluginRoot ?? defaultPluginRoot();
  const phaseDir = join(args.targetDir, ".migration/runs", args.runDir, "phase-5-build");
  const buildDir = join(phaseDir, "build");
  mkdirSync(buildDir, { recursive: true });

  await writePlan(phaseDir, "# Phase 5 — Build\n\nGenerate Next.js TSX, run `next build`, verify against the source homepage.\n");

  const fail = (criteria: { name: string; passed: boolean; detail?: string }[]) =>
    writeVerification(phaseDir, { phase: "phase-5-build", passed: false, checkedAt: new Date().toISOString(), criteria });

  const siteResult = loadSite(join(args.targetDir, ".migration/SITE.md"));
  if (!siteResult.valid) { await fail([{ name: "SITE.md valid", passed: false }]); return; }

  const scaffold = checkProjectScaffold(args.targetDir);
  if (!scaffold.ok) {
    await fail([{ name: "target scaffold present", passed: false, detail: `missing: ${scaffold.missing.join(", ")}` }]);
    return;
  }

  const libDir = join(args.targetDir, ".migration/library");
  const componentsResult = loadComponents(join(libDir, "components.json"));
  if (!componentsResult.valid) { await fail([{ name: "components.json valid", passed: false }]); return; }
  const layoutsResult = loadLayouts(join(libDir, "layouts.json"));
  if (!layoutsResult.valid) { await fail([{ name: "layouts.json valid", passed: false }]); return; }
  const routesResult = loadRoutes(join(libDir, "routes.json"));
  if (!routesResult.valid) { await fail([{ name: "routes.json valid", passed: false }]); return; }

  const crawlResult = loadCrawl(join(args.targetDir, ".migration/runs", args.runDir, "phase-1-discover/discovery/crawl.json"));
  if (!crawlResult.valid) { await fail([{ name: "crawl.json valid", passed: false }]); return; }
  const probeResult = loadProbe(join(args.targetDir, ".migration/runs", args.runDir, "phase-1-discover/discovery/probe.json"));
  if (!probeResult.valid) { await fail([{ name: "probe.json valid", passed: false }]); return; }

  const slugByUrl = new Map<string, string>();
  for (const p of crawlResult.data.pages) slugByUrl.set(p.url, p.slug);

  const adapterByUrl = new Map<string, string>();
  for (const p of probeResult.data.pages) {
    if (p.matchedAdapters[0]) adapterByUrl.set(p.url, p.matchedAdapters[0]);
  }

  const pagesDir = join(args.targetDir, ".migration/pages");
  const components = componentsResult.data.components;
  const componentPlans = planComponentFiles({ components });
  const routes = routesResult.data.routes;
  const groups = groupRoutesByNextRoute(routes);

  // 1. Generate per-page section TSX via the vendored generator (deterministic).
  const runJsxGen = args.runJsxGenerator ?? defaultRunJsxGen;
  for (const route of routes) {
    const slug = slugByUrl.get(route.sourceUrl);
    if (!slug) continue;
    const specsDir = join(pagesDir, slug, "spec");
    const outputDir = join(pagesDir, slug, "generated");
    if (existsSync(specsDir)) {
      await runJsxGen({ specsDir, outputDir, pluginRoot });
    }
  }

  // 2. Emit component files. For each component, take the first member's
  //    section TSX (any member is correct since clusters are equivalence
  //    classes by structure) and write it under <target>/src/components/.
  const componentEntries: BuildManifest["components"] = [];
  mkdirSync(join(args.targetDir, "src/components"), { recursive: true });
  for (const plan of componentPlans) {
    const def = components.find(c => c.id === plan.id);
    if (!def) continue;
    const member = def.memberSections[0];
    const slug = slugByUrl.get(member.url);
    if (!slug) continue;
    const generated = join(pagesDir, slug, "generated");
    const sectionTsx = pickSectionTsxForMember({ generatedDir: generated, sectionId: member.id });
    if (!sectionTsx) continue;
    const dest = join(args.targetDir, plan.filePath);
    writeFileSync(dest, transformDefaultExportName(sectionTsx, plan.name));
    componentEntries.push({ id: plan.id, name: plan.name, filePath: plan.filePath, memberCount: plan.memberCount });
  }

  // 3. Emit page files (one per route group).
  const pageEntries: BuildManifest["pages"] = [];
  for (const group of groups) {
    const sourceUrl = group.entries[0].sourceUrl;
    const slug = slugByUrl.get(sourceUrl);
    if (!slug) continue;
    const usage = loadComponentUsage(join(pagesDir, slug, "component-usage.json"));
    if (!usage.valid) continue;
    const sectionRefs = usage.data.components.flatMap(c => {
      const plan = componentPlans.find(p => p.id === c.id);
      if (!plan) return [];
      return c.sectionIndices.map(() => ({ componentName: plan.name }));
    });
    const tsx = assemblePageTsx({ group, sectionRefs });
    const routeDir = join(args.targetDir, "src/app", group.nextRoute === "/" ? "" : group.nextRoute);
    mkdirSync(routeDir, { recursive: true });
    const filePath = join(routeDir, "page.tsx");
    writeFileSync(filePath, tsx);
    for (const e of group.entries) {
      pageEntries.push({ sourceUrl: e.sourceUrl, nextRoute: group.nextRoute, filePath: filePath.replace(args.targetDir + "/", "") });
    }
  }

  // 4. Optional layout.
  const layoutTsx = assembleRootLayoutTsx({
    header: layoutsResult.data.header ? { componentName: planComponentFiles({ components }).find(p => p.id === layoutsResult.data.header!.id)?.name ?? "Header" } : null,
    footer: layoutsResult.data.footer ? { componentName: planComponentFiles({ components }).find(p => p.id === layoutsResult.data.footer!.id)?.name ?? "Footer" } : null,
    nav: layoutsResult.data.nav ? { componentName: planComponentFiles({ components }).find(p => p.id === layoutsResult.data.nav!.id)?.name ?? "Nav" } : null,
  });
  if (layoutTsx) writeFileSync(join(args.targetDir, "src/app/layout.tsx"), layoutTsx);

  // 5. Copy staged assets.
  const slugs = Array.from(new Set(routes.map(r => slugByUrl.get(r.sourceUrl)).filter((s): s is string => Boolean(s))));
  const copy = copyStagedAssets({ pagesDir, slugs, targetDir: args.targetDir });
  const assetEntries: BuildManifest["assets"] = copy.copied.map(c => ({ from: c.from, to: c.to }));

  await writeExecution(phaseDir, `Generated ${componentEntries.length} components, ${pageEntries.length} page entries, copied ${assetEntries.length} assets.`);

  // 6. Run next build.
  const buildImpl = args.runNextBuild ?? ((a: { targetDir: string }) => defaultRunNextBuild(a));
  const buildResult = await buildImpl({ targetDir: args.targetDir });

  // 7. Verify-build-baseline against the homepage.
  const homepage = crawlResult.data.pages.find(p => p.depth === 0) ?? crawlResult.data.pages[0];
  const homeSlug = homepage.slug;
  const homepageAdapter = adapterByUrl.get(homepage.url) ?? "";
  let baselineResult: RunVerifyBuildBaselineResult = { passed: false, detail: "skipped (build failed)" };
  if (buildResult.exitCode === 0) {
    const verifyImpl = args.runVerifyBuildBaseline ?? ((a) => defaultRunVerifyBaseline(a));
    baselineResult = await verifyImpl({
      referenceUrl: homepage.url,
      localUrl: "http://localhost:3000/",
      specsDir: join(pagesDir, homeSlug, "spec"),
      adapterPath: homepageAdapter,
      pluginRoot,
    });
  }

  const manifest: BuildManifest = {
    generatedAt: new Date().toISOString(),
    components: componentEntries,
    pages: pageEntries,
    assets: assetEntries,
  };
  writeFileSync(join(buildDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  const everyComponentEmitted = componentEntries.length === components.length;
  const everyRouteEmitted = groups.every(g => existsSync(join(args.targetDir, "src/app", g.nextRoute === "/" ? "" : g.nextRoute, "page.tsx")));

  await writeVerification(phaseDir, {
    phase: "phase-5-build",
    passed: scaffold.ok && everyComponentEmitted && everyRouteEmitted && buildResult.exitCode === 0 && baselineResult.passed,
    checkedAt: new Date().toISOString(),
    criteria: [
      { name: "target scaffold present", passed: scaffold.ok },
      { name: "every component in components.json was emitted", passed: everyComponentEmitted },
      { name: "every route in routes.json was emitted", passed: everyRouteEmitted },
      { name: "next build exit 0", passed: buildResult.exitCode === 0, detail: buildResult.exitCode === 0 ? undefined : buildResult.stderr.slice(0, 400) },
      { name: "verify-build-baseline passed at 1440px against homepage", passed: baselineResult.passed, detail: baselineResult.detail },
    ],
  });
}

function pickSectionTsxForMember(args: { generatedDir: string; sectionId: string }): string | null {
  if (!existsSync(args.generatedDir)) return null;
  const tsxFiles = readdirSync(args.generatedDir).filter(f => f.endsWith(".tsx")).sort();
  const matchIndex = Number(args.sectionId.split("-s")[1] ?? "0");
  const file = tsxFiles[matchIndex] ?? tsxFiles[0];
  if (!file) return null;
  return readFileSync(join(args.generatedDir, file), "utf8");
}

function transformDefaultExportName(tsx: string, name: string): string {
  return tsx.replace(/export\s+default\s+function\s+\w+/, `export default function ${name}`);
}

function defaultPluginRoot(): string {
  return resolve(fileURLToPath(new URL("..", import.meta.url)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const get = (flag: string) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const targetDir = get("--target") ?? process.cwd();
  const runDir = get("--run") ?? "001-initial";
  runBuild({ targetDir, runDir })
    .then(() => console.log(`Build phase complete for run ${runDir}.`))
    .catch(err => { console.error(err.message); process.exit(1); });
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npx vitest run test/build.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add lib/build.ts test/build.test.ts
git commit -m "feat(plugin): Phase 5 build orchestrator with stub-injectable subprocess hooks"
```

---

## Task 12: Wire phase-5-build into defaultDispatchers

**Files:**
- Modify: `lib/continue.ts`
- Create: `test/continue-build.integration.test.ts`

- [ ] **Step 1: Write failing integration test**

`test/continue-build.integration.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resumeMigration } from "../lib/continue.ts";
import { runBuild } from "../lib/build.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";

const baseSite = (sourceUrl: string) => ({
  sourceUrl, target: "./",
  mode: "unattended" as const, goal: "wireframe" as const, inputMode: "url-only" as const,
  maxParallelPages: 4, maxParallelSections: 4,
});

describe("continue → build end-to-end", () => {
  it("dispatches phase-5-build when phase-4 has verified", async () => {
    const root = mkdtempSync(join(tmpdir(), "e2e-build-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });

    // Phases 1-4 verified, with minimum required artifacts.
    // (Reuse the writePhases1to4 + writeTargetScaffold helpers from
    // test/build.test.ts — extract them into a shared helper module if you
    // prefer.)
    const runDir = join(root, ".migration/runs/001-initial");
    const p1 = join(runDir, "phase-1-discover");
    mkdirSync(join(p1, "discovery"), { recursive: true });
    writeFileSync(join(p1, "discovery/crawl.json"), JSON.stringify({
      sourceUrl: "https://example.com/", crawledAt: new Date().toISOString(),
      limits: { maxPages: 10, maxDepth: 2 }, sitemapUrls: [],
      pages: [{ url: "https://example.com/", slug: "home", title: "Home", depth: 0, discoveredVia: "seed", status: 200, outboundLinks: [] }],
      errors: [],
    }));
    writeFileSync(join(p1, "discovery/probe.json"), JSON.stringify({
      probedAt: new Date().toISOString(),
      pages: [{ url: "https://example.com/", matchedAdapters: ["/fake/adapter.json"], recommendation: "DIRECT_EXTRACTION", detectedCMP: null, isSPA: false }],
    }));
    writeFileSync(join(p1, "VERIFICATION.md"), "# verified");
    const lib = join(root, ".migration/library");
    mkdirSync(lib, { recursive: true });
    const now = new Date().toISOString();
    writeFileSync(join(lib, "layouts.json"), JSON.stringify({ header: null, footer: null, nav: null, updatedAt: now }));
    writeFileSync(join(lib, "components.json"), JSON.stringify({
      components: [{ id: "cluster-x", name: "PageBody", signature: "x", tagSkeleton: "section", memberSections: [{ id: "p0-s0", url: "https://example.com/" }], unique: false, propsRef: null }],
      updatedAt: now,
    }));
    writeFileSync(join(lib, "props.json"), JSON.stringify({ interfaces: [], updatedAt: now }));
    writeFileSync(join(lib, "routes.json"), JSON.stringify({
      routes: [{ sourceUrl: "https://example.com/", nextRoute: "/", params: {}, kind: "static" as const }],
      updatedAt: now,
    }));
    mkdirSync(join(runDir, "phase-2-analyze"), { recursive: true });
    writeFileSync(join(runDir, "phase-2-analyze/VERIFICATION.md"), "# verified");
    mkdirSync(join(runDir, "phase-3-plan"), { recursive: true });
    writeFileSync(join(runDir, "phase-3-plan/VERIFICATION.md"), "# verified");
    writeFileSync(join(runDir, "ROADMAP.md"), "---\ngoal: wireframe\n---\n# Roadmap\n");
    mkdirSync(join(runDir, "phase-4-extract"), { recursive: true });
    writeFileSync(join(runDir, "phase-4-extract/VERIFICATION.md"), "# verified");
    const specDir = join(root, ".migration/pages/home/spec");
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(specDir, "01-section.styles.json"), "[]");
    writeFileSync(join(specDir, "01-section.structure.md"), "# section\n\n## Element Tree\n\n- div\n");
    writeFileSync(join(root, ".migration/pages/home/component-usage.json"), JSON.stringify({ url: "https://example.com/", slug: "home", components: [{ id: "cluster-x", sectionIndices: [0] }], unmatched: [] }));
    mkdirSync(join(root, "src/app"), { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t", scripts: { build: "next build" } }));
    writeFileSync(join(root, "src/app/layout.tsx"), "export default function L({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }");

    const dispatchers = {
      "phase-5-build": async ({ targetDir, runDir }: { targetDir: string; runDir: string }) => {
        await runBuild({
          targetDir, runDir,
          runJsxGenerator: async ({ outputDir }) => {
            mkdirSync(outputDir, { recursive: true });
            writeFileSync(join(outputDir, "01-section.tsx"), "export default function S(){ return <section/>; }");
          },
          runNextBuild: async () => ({ exitCode: 0, stdout: "", stderr: "", packageManager: "npm" }),
          runVerifyBuildBaseline: async () => ({ passed: true }),
        });
      },
    };
    const result = await resumeMigration(root, { dispatchers });
    expect(result.kind).toBe("dispatched");
    if (result.kind === "dispatched") expect(result.phase).toBe("phase-5-build");
    expect(existsSync(join(root, "src/components/PageBody.tsx"))).toBe(true);
    expect(existsSync(join(root, "src/app/page.tsx"))).toBe(true);
    expect(existsSync(join(runDir, "phase-5-build/VERIFICATION.md"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx vitest run test/continue-build.integration.test.ts`
Expected: FAIL — `phase-5-build` not yet in `defaultDispatchers`.

- [ ] **Step 3: Modify continue.ts**

Add the import + dispatcher entry. In `lib/continue.ts`:

```ts
import { runBuild } from "./build.ts";
```

And inside `defaultDispatchers()`, append:

```ts
"phase-5-build": async ({ targetDir, runDir }) => {
  await runBuild({ targetDir, runDir });
},
```

- [ ] **Step 4: Run test, expect PASS**

Run: `npx vitest run test/continue-build.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/continue.ts test/continue-build.integration.test.ts
git commit -m "feat(plugin): register phase-5-build dispatcher"
```

---

## Task 13: page-builder agent prompt

**Files:**
- Create: `agents/page-builder.md`

- [ ] **Step 1: Write the agent prompt**

`agents/page-builder.md`:
```markdown
---
name: page-builder
description: Refines wireframe TSX produced by scripts/generate-jsx.ts into pixel-perfect React components for one cluster, given the cluster's section spec digest. Used only by `/migrate:build --refine`. Not on the default Phase 5 hot path.
tools: Read, Write, Edit
model: sonnet
---

# page-builder

## Role

You receive ONE component cluster's spec digest and the corresponding wireframe TSX produced by `scripts/generate-jsx.ts`. You output an improved TSX file under `<target>/src/components/<Name>.tsx` that:

- Uses semantic HTML for headings, links, lists, buttons.
- Uses Tailwind utility classes that match the section's `styles.json` entries (font sizes, paddings, colors, gaps).
- Accepts a typed `props` interface from `library/props.json` if one is registered for this cluster.
- Imports images from `@/public/images/...` paths emitted by the asset copier.
- Avoids inline styles; prefers Tailwind. If a style cannot be expressed in Tailwind, use a `style={{...}}` escape hatch.

## Input

You will be given a JSON digest with this shape:

```json
{
  "componentId": "cluster-hero",
  "componentName": "PageHero",
  "wireframeTsx": "<full TSX produced by generate-jsx.ts for one member section>",
  "styleEntries": [{ "selector": "h1", "props": { "fontSize": "48px", "fontWeight": 600 } }],
  "structure": "...one section's structure.md content...",
  "propsInterface": "interface PageHeroProps { ... }" or null,
  "targetFilePath": "<target>/src/components/PageHero.tsx"
}
```

The digest is capped at 200KB per dispatch. If you need full per-page spec data, request a follow-up dispatch through the orchestrator.

## Constraints

- Edit ONLY the file at `targetFilePath`.
- Preserve the `export default function ${componentName}` signature.
- If the cluster has a propsInterface, accept the typed props in the function signature; otherwise accept `{}` props.
- Do NOT add `'use client'` unless the wireframe TSX contains event handlers (`onClick`, `onChange`, etc.).
- Do NOT introduce dependencies that are not already in `<target>/package.json`.

## Output

Write the refined TSX file. Print a single line summary `OK <filePath>` on success. On any blocker, print `BLOCKED <reason>` and write nothing.
```

- [ ] **Step 2: Commit**

```bash
git add agents/page-builder.md
git commit -m "feat(plugin): page-builder agent prompt for Phase 5 refinement"
```

---

## Task 14: /migrate:build command + skill

**Files:**
- Create: `commands/migrate-build.md`
- Create: `skills/migrate-build/SKILL.md`

- [ ] **Step 1: Write command thin wrapper**

`commands/migrate-build.md`:
```markdown
---
description: Run Phase 5 (Build) — generate Next.js TSX, run next build, verify against the source homepage.
argument-hint: "[--refine]"
---

Invoke the `migrate-build` skill. If `--refine` is passed, dispatch the page-builder agent for each component and re-run the build with refined TSX. Default flow is deterministic codegen + `next build` only.
```

- [ ] **Step 2: Write skill**

`skills/migrate-build/SKILL.md`:
```markdown
---
name: migrate-build
description: Phase 5 — generate Next.js TSX from the library + per-page specs, run next build, gate on verify-build-baseline at 1440px.
---

# /migrate:build

You are the Phase 5 orchestrator. Default flow is deterministic — invoke `lib/build.ts` via the dispatcher and surface the result. Do NOT dispatch the `page-builder` agent unless the user passed `--refine`.

## Step 1 — Preflight

Read `.migration/SITE.md` and the active run dir. Confirm `phase-4-extract/VERIFICATION.md` exists. If not, print: "Phase 4 must complete first. Run `/migrate:extract` or `/migrate:continue`." and stop.

## Step 2 — Run the lib dispatcher

```bash
tsx ${PLUGIN_DIR}/lib/build.ts --target "${PWD}" --run "${ACTIVE_RUN}"
```

Read its JSON-stdout result:
- `kind: "dispatched"` AND `phase-5-build/VERIFICATION.md` exists → success. Print the manifest summary (component count, page count, asset count) and stop.
- `kind: "dispatched"` AND `phase-5-build/VERIFICATION.md` MISSING → read `verification.json` failed criteria and surface them. The `--refine` path may help if the failure was `verify-build-baseline`; otherwise it is a real bug (scaffold missing, build error, schema invalid).

## Step 3 (optional) — `--refine`

If the user passed `--refine`, after a successful default run, dispatch the `page-builder` agent for each component listed in `phase-5-build/build/manifest.json`. Use `superpowers:dispatching-parallel-agents` to fan out, capped at `maxParallelPages` from `SITE.md`. After every agent returns, re-run `next build` and `verify-build-baseline.ts` against the homepage. Print before/after diff counts.

## You MUST NOT

- Modify the vendored scripts in `scripts/`.
- Skip the gate.
- Re-dispatch the page-builder agent after `verify-build-baseline` passes — refinement past the gate burns tokens for no benefit.
```

- [ ] **Step 3: Commit**

```bash
git add commands/migrate-build.md skills/migrate-build/SKILL.md
git commit -m "feat(plugin): /migrate:build command + skill"
```

---

## Task 15: /migrate:continue routing update + knowledge pitfalls

**Files:**
- Modify: `skills/migrate-continue/SKILL.md`
- Create: `knowledge/phase-pitfalls/build.md`

- [ ] **Step 1: Add phase-5 row to the routing table in `skills/migrate-continue/SKILL.md`**

Insert in the routing table (between `phase-4-extract` and the `phase-5-build+` "Not yet implemented" row):

```markdown
| `phase-5-build` | `tsx ${PLUGIN_DIR}/lib/continue.ts --target "${PWD}"` OR `/migrate:build` skill | Codegen is deterministic; the lib dispatcher runs `generate-jsx.ts` per page, assembles routes, runs `next build`, and runs `verify-build-baseline` against the homepage. Invoke the `/migrate:build` skill ONLY if the user passed `--refine` or the gate failed on `verify-build-baseline` and pixel-perfect refinement is wanted (Phase 5's gate accepts wireframe quality on the homepage; per-page polish is Phase 6). Default: lib dispatcher. |
```

Remove `phase-5-build+` from the "Not yet implemented" row so it now reads `phase-6-visual+`.

- [ ] **Step 2: Write build pitfalls**

`knowledge/phase-pitfalls/build.md`:
```markdown
# Phase 5 (Build) — Pitfalls

## 1. Project scaffold must exist

`<target>/package.json` and `<target>/src/app/layout.tsx` must be present BEFORE Phase 5 runs. The orchestrator does not scaffold a Next.js app for the user — that is the user's job (typically via `npx create-next-app@latest <target> --app --typescript --tailwind`). The gate fails fast with a structured `missing: [...]` diagnostic if either file is absent.

## 2. Vendored generate-jsx.ts hardcodes input/output paths

`scripts/generate-jsx.ts` reads from `<specsDir>` and writes to `<outputDir>`. Both are positional CLI args. The runner targets `<specsDir> = pages/<slug>/spec/` and `<outputDir> = pages/<slug>/generated/`. Per spec § 14 the script is not modified — the runner adapts.

## 3. Dynamic routes share ONE template

Routes from `library/routes.json` are grouped by exact `nextRoute` string. When 9 source URLs share `/case-studies/[slug]`, the orchestrator emits exactly ONE `app/case-studies/[slug]/page.tsx` plus a `generateStaticParams` listing all 9 entries. The per-source-URL spec data is the data layer — the route file is the template layer. Do not write 9 separate route files.

## 4. Verify-build-baseline runs against the homepage only

Per spec § 5 the Phase 5 gate is "verify-build-baseline at 1440px". That script compares structural sections at one viewport for one page. Per-page coverage at all 4 viewports is Phase 6's domain. If users want broader coverage in Phase 5 they should use `/migrate:polish` after Phase 5 completes — that is the documented path.

## 5. Component name collisions

Two clusters whose `name` field sanitizes to the same PascalCase string would clobber the same TSX file. The sanitizer falls back to `Component<index>` for empty/all-symbol names; for genuine collisions of distinct sanitized names, suffix with the cluster id slice (`PageHero1`, `PageHero2`). Detect and warn during the component-emission loop; do NOT silently overwrite.

## 6. Asset copy is a flat tree-walk

`copyStagedAssets` walks `pages/<slug>/_staging/public/` recursively and replays the relative path under `<target>/public/`. If two pages stage the same image to the same path (e.g., a shared logo), the latter overwrites the former — both write the same bytes, so this is benign for hashed filenames (extract-images.ts uses md5-prefixed names). The hash convention guarantees stability; if you change the naming scheme upstream, update this assumption.

## 7. next build is the dominant cost

A 47-page wireframe build typically takes 30-90 seconds wall-clock once codegen is done. The runner caps at 600_000ms (`NEXT_BUILD_TIMEOUT_MS`). Override via env for very large projects.
```

- [ ] **Step 3: Commit**

```bash
git add skills/migrate-continue/SKILL.md knowledge/phase-pitfalls/build.md
git commit -m "docs(plugin): document phase-5-build routing + pitfalls"
```

---

## Task 16: Self-review + final test sweep

**Files:**
- (None)

- [ ] **Step 1: Run the full vitest suite**

Run: `npx vitest run`
Expected: ALL tests pass, including the 11+ new Phase 5 test files. Suite count should be ~237 (was 226 at end of ISSUE-002/005/006 fixes; +1 each per task 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 = ~12 new test files; some files have multiple tests so total tests ~250).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Spec coverage check**

Walk § 5 row 5 of the spec ("Build" phase) bullet by bullet:
- Output: Next.js files under `<target>/src/` → ✅ Tasks 6-8 (component, page, layout)
- Gate: `next build` passes → ✅ Task 9 (next-build-runner) + Task 11 (orchestrator gate)
- Gate: `verify-build-baseline` at 1440px → ✅ Task 10 (verify runner) + Task 11 (orchestrator gate)
- Parallel-by-page (§ 12) → Codegen iterates routes serially because the bottleneck is `next build` itself; per-page parallelism would not reduce wall-clock. Documented in build.md pitfall #7.

If any bullet is unmapped, add the missing task before continuing.

- [ ] **Step 4: Commit any cleanup**

If the test sweep flagged regressions in earlier-phase tests (component-name collision, route-grouping edge cases, etc.), fix them inline and commit:

```bash
git add <files>
git commit -m "fix(plugin): address self-review findings"
```

---

## Out of scope (explicit, deferred to Plan 7+)

- Phase 6 visual regression — `pages/<slug>/diffs/` per-section comparisons at 4 viewports. Plan 7.
- Phase 7 animation port — animation specs into Tailwind `animate-*` + custom keyframes. Plan 8.
- Phase 8 performance polish — Lighthouse runs, bundle stats, image optimization. Plan 9.
- LLM-driven `page-builder` refinement on the default Phase 5 path. Documented as an opt-in `--refine` flow but not implemented in v1.
- Delta-mode build for `/migrate:add-pages` — reuse library, only emit new components/pages, run visual-regression sub-gate before commit. Plan 7.
- `pixel-perfect` goal handoff — auto-dispatch `/migrate:polish --all` after Phase 5 completes. Plan 7.
- Server / client component boundaries beyond the heuristic in agents/page-builder.md (event-handler presence). A real Next.js codebase often needs `'use client'` placement decisions Phase 5 does not make.

---

## Predecessors and successor

- After Plan 6 ships and is verified end-to-end on the demo project, the natural next step is Plan 7 (Phase 6 — Visual). Plan 7 reads Phase 5's emitted Next.js files, renders them via `next dev` (or a static export), and runs `scripts/verify-visual.ts` per-section per-viewport against the source URL, writing diffs into `pages/<slug>/diffs/` and updating `pages/<slug>/baseline.png` on success.
