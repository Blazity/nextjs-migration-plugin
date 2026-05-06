# Plugin Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the skeleton of a Claude Code plugin that installs cleanly, validates deps, bootstraps the `.migration/` state directory via a wizard, and exposes status/config commands — the foundation that all later plans build on.

**Architecture:** New sibling repo (`nextjs-migration-plugin`) with its own git history. TypeScript core library for schemas, loaders, and state manipulation (Zod-validated). Vitest for unit tests. Markdown skills and agents for LLM-facing flows. Scripts and adapters vendored verbatim from the old repo. Session-start hook enforces the hard dep on `superpowers`.

**Tech Stack:** TypeScript, Zod, Vitest, Node.js ≥22, pnpm. Markdown for skills/agents. Shell-invokable TS via `tsx`.

**Execution context:** Tasks run from the existing `nextjs-migration-agent` repo. They create a sibling directory `../nextjs-migration-plugin/` and operate inside it. All paths in this plan are relative to wherever the executor starts. Once the sibling is scaffolded, subsequent tasks cd into it.

**Spec source:** `docs/specs/2026-04-21-migration-plugin-design.md`

---

## File structure (what this plan produces)

```
nextjs-migration-plugin/
├── .git/
├── .gitignore
├── README.md
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── vitest.config.ts
├── plugin.json
├── hooks/
│   └── session-start.js
├── schemas/
│   ├── adapter.ts              # Zod AdapterSchema
│   ├── site.ts                 # Zod SiteFrontmatterSchema
│   └── errors.ts               # diagnostic types
├── lib/
│   ├── load-adapter.ts         # Zod-validated loader (diagnostic return)
│   ├── load-adapter-with-repair.ts
│   ├── load-site.ts            # frontmatter parser + validator
│   ├── bootstrap.ts            # creates .migration/ skeleton
│   ├── new-migration.ts        # CLI entry for /migrate:new
│   ├── status.ts               # /migrate:status logic
│   ├── config.ts               # /migrate:config logic
│   └── session-check.ts        # dep validation logic (hook-agnostic)
├── commands/
│   ├── migrate-new.md
│   ├── migrate-status.md
│   └── migrate-config.md
├── skills/
│   ├── migrate-new/SKILL.md
│   ├── migrate-status/SKILL.md
│   └── migrate-config/SKILL.md
├── agents/
│   └── adapter-repairer.md
├── scripts/                    # vendored verbatim from old repo
├── adapters/                   # vendored verbatim + TEMPLATE.md
├── knowledge/
│   ├── lessons.md              # vendored from .ai/lessons.md
│   └── phase-pitfalls/         # empty for v1, populated in later plans
└── test/
    ├── fixtures/
    │   ├── adapter-valid.json
    │   ├── adapter-invalid.json
    │   └── site-valid.md
    ├── adapter-schema.test.ts
    ├── load-adapter.test.ts
    ├── load-adapter-with-repair.test.ts
    ├── site-schema.test.ts
    ├── load-site.test.ts
    ├── bootstrap.test.ts
    ├── new-migration.test.ts
    ├── status.test.ts
    ├── config.test.ts
    └── session-check.test.ts
```

Each file has a single responsibility. Schemas define data shape. Loaders parse+validate. State functions read/write `.migration/`. Commands and skills are thin LLM-facing markdown. No file mixes concerns.

---

## Task 1: Scaffold sibling plugin repo

**Files:**
- Create: `../nextjs-migration-plugin/.gitignore`
- Create: `../nextjs-migration-plugin/README.md`

- [ ] **Step 1: Create sibling dir and initialize git**

```bash
cd ..
mkdir nextjs-migration-plugin
cd nextjs-migration-plugin
git init
```

Expected: `.git/` directory created, empty working tree.

- [ ] **Step 2: Write .gitignore**

Create `.gitignore`:
```
node_modules/
dist/
coverage/
.DS_Store
*.log
.migration/
```

- [ ] **Step 3: Write initial README stub**

Create `README.md`:
```markdown
# nextjs-migration-plugin

Claude Code plugin for pixel-perfect, multi-page Next.js migrations.

See `docs/specs/2026-04-21-migration-plugin-design.md` in the companion repo for design details.

## Status

Under development. See `.ai/plans/` for the implementation roadmap.
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore README.md
git commit -m "chore(plugin): scaffold plugin repo"
```

Expected: first commit in new repo. `git log` shows one commit.

---

## Task 2: Add TypeScript toolchain + Vitest

**Files:**
- Create: `../nextjs-migration-plugin/package.json`
- Create: `../nextjs-migration-plugin/tsconfig.json`
- Create: `../nextjs-migration-plugin/vitest.config.ts`

- [ ] **Step 1: Initialize package.json**

From the plugin dir:
```bash
cd ../nextjs-migration-plugin
pnpm init
```

Then replace the generated `package.json` with:
```json
{
  "name": "nextjs-migration-plugin",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

- [ ] **Step 2: Install dependencies**

```bash
pnpm add zod gray-matter
pnpm add -D typescript tsx vitest @types/node
```

Expected: `pnpm-lock.yaml` created, `node_modules/` populated. Versions are whatever is current at install time — do not hardcode versions in this plan.

- [ ] **Step 3: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["lib/**/*", "schemas/**/*", "hooks/**/*", "test/**/*"]
}
```

- [ ] **Step 4: Write vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globals: true,
  },
});
```

- [ ] **Step 5: Verify toolchain runs**

```bash
pnpm test
```

Expected: Vitest runs, reports "No test files found", exits 0.

```bash
pnpm typecheck
```

Expected: `tsc --noEmit` exits 0 (no errors).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vitest.config.ts
git commit -m "chore(plugin): add TypeScript and Vitest toolchain"
```

---

## Task 3: Zod adapter schema — failing test

**Files:**
- Create: `../nextjs-migration-plugin/test/fixtures/adapter-valid.json`
- Create: `../nextjs-migration-plugin/test/fixtures/adapter-invalid.json`
- Create: `../nextjs-migration-plugin/test/adapter-schema.test.ts`

- [ ] **Step 1: Create a valid fixture**

Create `test/fixtures/adapter-valid.json`:
```json
{
  "name": "webflow",
  "type": "framework",
  "version": "1.0.0",
  "detection": {
    "metaGenerator": ["Webflow"],
    "jsMarkers": ["Webflow.ready"],
    "classNamePrefixes": ["w-"]
  },
  "sectionDiscovery": {
    "selector": "section, div[class*='section']",
    "unwrap": false,
    "minSectionCount": 3,
    "maxSectionCount": 30,
    "spaContainerHints": []
  },
  "animations": {
    "engine": "ix2",
    "jsGlobal": "Webflow.ix2",
    "defaultDurationMs": 400
  }
}
```

- [ ] **Step 2: Create an invalid fixture**

Create `test/fixtures/adapter-invalid.json`:
```json
{
  "name": "broken",
  "type": "not-a-valid-type",
  "detection": {}
}
```

Missing `version`. `type` is invalid enum value.

- [ ] **Step 3: Write the failing schema test**

Create `test/adapter-schema.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { AdapterSchema } from "../schemas/adapter.ts";

const readFixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("AdapterSchema", () => {
  it("accepts a valid adapter", () => {
    const valid = readFixture("adapter-valid.json");
    const result = AdapterSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects an adapter with an invalid type enum", () => {
    const invalid = readFixture("adapter-invalid.json");
    const result = AdapterSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("type"))).toBe(true);
    }
  });

  it("rejects an adapter missing required 'version'", () => {
    const invalid = readFixture("adapter-invalid.json");
    const result = AdapterSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("version"))).toBe(true);
    }
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
pnpm test test/adapter-schema.test.ts
```

Expected: FAIL with `Cannot find module '../schemas/adapter.ts'`.

---

## Task 4: Zod adapter schema — implementation

**Files:**
- Create: `../nextjs-migration-plugin/schemas/adapter.ts`

- [ ] **Step 1: Implement the schema**

Create `schemas/adapter.ts`:
```typescript
import { z } from "zod";

export const DetectionSchema = z.object({
  metaGenerator: z.array(z.string()).optional(),
  httpHeaders: z.record(z.string()).optional(),
  jsMarkers: z.array(z.string()).optional(),
  domMarkers: z.array(z.string()).optional(),
  urlPatterns: z.array(z.string()).optional(),
  classNamePrefixes: z.array(z.string()).optional(),
  cdnDomains: z.array(z.string()).optional(),
});

export const SectionDiscoverySchema = z.object({
  selector: z.string(),
  unwrap: z.boolean().default(false),
  minSectionCount: z.number().int().positive().default(3),
  maxSectionCount: z.number().int().positive().default(30),
  spaContainerHints: z.array(z.string()).default([]),
});

export const AnimationSchema = z.object({
  engine: z.enum(["ix2", "css-transitions", "framer-motion", "gsap", "none"]),
  jsGlobal: z.string().optional(),
  defaultDurationMs: z.number().optional(),
});

export const LocalSiteSchema = z.object({
  sectionSelector: z.string().optional(),
  devToolsHideScript: z.string().optional(),
}).optional();

export const DynamicElementSchema = z.object({
  selector: z.string(),
  reason: z.string(),
});

export const ValidationResultSchema = z.object({
  url: z.string(),
  passed: z.boolean(),
  notes: z.string(),
});

export const AdapterSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["framework", "cms"]),
  version: z.string(),
  detection: DetectionSchema,
  sectionDiscovery: SectionDiscoverySchema.optional(),
  styles: z.record(z.unknown()).optional(),
  images: z.object({
    cdnPatterns: z.array(z.string()).optional(),
    responsiveFormat: z.string().optional(),
  }).optional(),
  animations: AnimationSchema.optional(),
  localSite: LocalSiteSchema,
  dynamicElements: z.array(DynamicElementSchema).default([]),
  validation: z.object({
    lastRun: z.string().optional(),
    passRate: z.number().min(0).max(1).optional(),
    results: z.array(ValidationResultSchema).optional(),
  }).optional(),
});

export type Adapter = z.infer<typeof AdapterSchema>;
```

- [ ] **Step 2: Run test to verify it passes**

```bash
pnpm test test/adapter-schema.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add schemas/adapter.ts test/adapter-schema.test.ts test/fixtures/adapter-valid.json test/fixtures/adapter-invalid.json
git commit -m "feat(plugin): add Zod adapter schema with tests"
```

---

## Task 5: Adapter loader with diagnostic return — failing test

**Files:**
- Create: `../nextjs-migration-plugin/test/load-adapter.test.ts`

- [ ] **Step 1: Write the failing loader test**

Create `test/load-adapter.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadAdapter } from "../lib/load-adapter.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadAdapter", () => {
  it("returns { valid: true, adapter } for a valid adapter file", () => {
    const result = loadAdapter(fixturePath("adapter-valid.json"));
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.adapter.name).toBe("webflow");
    }
  });

  it("returns { valid: false, issues, rawJson, path } for an invalid adapter", () => {
    const path = fixturePath("adapter-invalid.json");
    const result = loadAdapter(path);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.path).toBe(path);
      expect(Array.isArray(result.issues)).toBe(true);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.rawJson).toEqual({
        name: "broken",
        type: "not-a-valid-type",
        detection: {},
      });
    }
  });

  it("returns { valid: false } with a parse-error issue when file is malformed JSON", () => {
    // Use a known-bad file — create inline for this test
    const { writeFileSync, mkdtempSync } = require("node:fs");
    const { tmpdir } = require("node:os");
    const { join } = require("node:path");
    const dir = mkdtempSync(join(tmpdir(), "adapter-test-"));
    const badPath = join(dir, "bad.json");
    writeFileSync(badPath, "{ not: json }");
    const result = loadAdapter(badPath);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues[0].code).toBe("custom");
      expect(result.issues[0].message).toMatch(/JSON/i);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test test/load-adapter.test.ts
```

Expected: FAIL with `Cannot find module '../lib/load-adapter.ts'`.

---

## Task 6: Adapter loader — implementation

**Files:**
- Create: `../nextjs-migration-plugin/schemas/errors.ts`
- Create: `../nextjs-migration-plugin/lib/load-adapter.ts`

- [ ] **Step 1: Define the diagnostic result types**

Create `schemas/errors.ts`:
```typescript
import type { z } from "zod";

export type LoadResult<T> =
  | { valid: true; adapter: T }
  | { valid: false; issues: z.ZodIssue[]; rawJson: unknown; path: string };
```

- [ ] **Step 2: Implement the loader**

Create `lib/load-adapter.ts`:
```typescript
import { readFileSync } from "node:fs";
import { AdapterSchema, type Adapter } from "../schemas/adapter.ts";
import type { LoadResult } from "../schemas/errors.ts";

export function loadAdapter(path: string): LoadResult<Adapter> {
  let rawJson: unknown;
  try {
    const contents = readFileSync(path, "utf8");
    rawJson = JSON.parse(contents);
  } catch (err) {
    return {
      valid: false,
      path,
      rawJson: null,
      issues: [{
        code: "custom",
        path: [],
        message: `Failed to parse JSON: ${(err as Error).message}`,
      }],
    };
  }

  const result = AdapterSchema.safeParse(rawJson);
  if (result.success) {
    return { valid: true, adapter: result.data };
  }
  return {
    valid: false,
    path,
    rawJson,
    issues: result.error.issues,
  };
}
```

- [ ] **Step 3: Run test to verify it passes**

```bash
pnpm test test/load-adapter.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add schemas/errors.ts lib/load-adapter.ts test/load-adapter.test.ts
git commit -m "feat(plugin): add adapter loader with diagnostic return"
```

---

## Task 7: Adapter loader with auto-repair wrapper — failing test

**Files:**
- Create: `../nextjs-migration-plugin/test/load-adapter-with-repair.test.ts`

- [ ] **Step 1: Write failing test**

Create `test/load-adapter-with-repair.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAdapterWithRepair, UnrepairableAdapterError } from "../lib/load-adapter-with-repair.ts";

function tempAdapterFile(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "repair-test-"));
  const path = join(dir, "adapter.json");
  writeFileSync(path, contents);
  return path;
}

describe("loadAdapterWithRepair", () => {
  it("returns adapter on first call when already valid", async () => {
    const path = tempAdapterFile(JSON.stringify({
      name: "x", type: "framework", version: "1",
      detection: {},
    }));
    const dispatch = vi.fn();
    const adapter = await loadAdapterWithRepair(path, dispatch);
    expect(adapter.name).toBe("x");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches repairer when invalid, then succeeds after repair", async () => {
    const path = tempAdapterFile(JSON.stringify({ name: "x" }));
    const dispatch = vi.fn().mockImplementation(async () => {
      writeFileSync(path, JSON.stringify({
        name: "x", type: "framework", version: "1", detection: {},
      }));
    });
    const adapter = await loadAdapterWithRepair(path, dispatch);
    expect(adapter.name).toBe("x");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("throws UnrepairableAdapterError after 3 failed repair attempts", async () => {
    const path = tempAdapterFile(JSON.stringify({ name: "x" }));
    const dispatch = vi.fn().mockImplementation(async () => {
      // no-op repair — file stays broken
    });
    await expect(loadAdapterWithRepair(path, dispatch)).rejects.toBeInstanceOf(UnrepairableAdapterError);
    expect(dispatch).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test test/load-adapter-with-repair.test.ts
```

Expected: FAIL with `Cannot find module '../lib/load-adapter-with-repair.ts'`.

---

## Task 8: Adapter loader with auto-repair wrapper — implementation

**Files:**
- Create: `../nextjs-migration-plugin/lib/load-adapter-with-repair.ts`

- [ ] **Step 1: Implement the wrapper**

Create `lib/load-adapter-with-repair.ts`:
```typescript
import { loadAdapter } from "./load-adapter.ts";
import type { Adapter } from "../schemas/adapter.ts";
import type { LoadResult } from "../schemas/errors.ts";

export class UnrepairableAdapterError extends Error {
  constructor(public lastResult: Extract<LoadResult<Adapter>, { valid: false }>) {
    super(`Adapter at ${lastResult.path} could not be auto-repaired after 3 attempts.`);
    this.name = "UnrepairableAdapterError";
  }
}

export type RepairDispatcher = (
  diagnostic: Extract<LoadResult<Adapter>, { valid: false }>,
) => Promise<void>;

export async function loadAdapterWithRepair(
  path: string,
  dispatch: RepairDispatcher,
  maxAttempts = 3,
): Promise<Adapter> {
  let last: LoadResult<Adapter> | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = loadAdapter(path);
    if (result.valid) return result.adapter;
    last = result;
    await dispatch(result);
  }
  const final = loadAdapter(path);
  if (final.valid) return final.adapter;
  throw new UnrepairableAdapterError(last as Extract<LoadResult<Adapter>, { valid: false }>);
}
```

Note on the retry logic: three dispatches, then one final validation. If the third dispatch fixed things, we pick that up.

Actually re-reading the test: it expects exactly 3 dispatches when unrepairable. Fix the loop to match:

```typescript
export async function loadAdapterWithRepair(
  path: string,
  dispatch: RepairDispatcher,
  maxAttempts = 3,
): Promise<Adapter> {
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    const result = loadAdapter(path);
    if (result.valid) return result.adapter;
    if (attempt === maxAttempts) {
      throw new UnrepairableAdapterError(result);
    }
    await dispatch(result);
  }
  throw new Error("unreachable");
}
```

This validates, then dispatches, up to `maxAttempts` dispatches, then one final validation check. Matches the test: 3 dispatches, 4 validations, throws on final.

Use this second version.

- [ ] **Step 2: Run test to verify it passes**

```bash
pnpm test test/load-adapter-with-repair.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add lib/load-adapter-with-repair.ts test/load-adapter-with-repair.test.ts
git commit -m "feat(plugin): add adapter auto-repair wrapper"
```

---

## Task 9: Site frontmatter schema — failing test

**Files:**
- Create: `../nextjs-migration-plugin/test/site-schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/site-schema.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { SiteFrontmatterSchema } from "../schemas/site.ts";

describe("SiteFrontmatterSchema", () => {
  const minimal = {
    sourceUrl: "https://example.com",
    target: "./",
    mode: "attended",
    goal: "pixel-perfect",
    inputMode: "url-only",
  };

  it("accepts a minimal valid frontmatter", () => {
    const result = SiteFrontmatterSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it("rejects missing sourceUrl", () => {
    const { sourceUrl, ...incomplete } = minimal;
    const result = SiteFrontmatterSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it("rejects invalid mode enum", () => {
    const result = SiteFrontmatterSchema.safeParse({ ...minimal, mode: "weird" });
    expect(result.success).toBe(false);
  });

  it("rejects reserved inputMode 'content-migration' in v1", () => {
    const result = SiteFrontmatterSchema.safeParse({ ...minimal, inputMode: "content-migration" });
    expect(result.success).toBe(false);
  });

  it("accepts optional sourceRepo when inputMode is url-plus-repo", () => {
    const result = SiteFrontmatterSchema.safeParse({
      ...minimal,
      inputMode: "url-plus-repo",
      sourceRepo: "/Users/dev/example",
    });
    expect(result.success).toBe(true);
  });

  it("defaults maxParallelPages and maxParallelSections to 4", () => {
    const result = SiteFrontmatterSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxParallelPages).toBe(4);
      expect(result.data.maxParallelSections).toBe(4);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test test/site-schema.test.ts
```

Expected: FAIL with module-not-found.

---

## Task 10: Site frontmatter schema — implementation

**Files:**
- Create: `../nextjs-migration-plugin/schemas/site.ts`

- [ ] **Step 1: Implement the schema**

Create `schemas/site.ts`:
```typescript
import { z } from "zod";

export const SiteFrontmatterSchema = z.object({
  sourceUrl: z.string().url(),
  target: z.string(),
  mode: z.enum(["attended", "unattended"]),
  goal: z.enum(["wireframe", "pixel-perfect"]),
  inputMode: z.enum(["url-only", "url-plus-repo"]),
  sourceRepo: z.string().optional(),
  maxParallelPages: z.number().int().positive().default(4),
  maxParallelSections: z.number().int().positive().default(4),
});

export type SiteFrontmatter = z.infer<typeof SiteFrontmatterSchema>;
```

- [ ] **Step 2: Run test to verify it passes**

```bash
pnpm test test/site-schema.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 3: Commit**

```bash
git add schemas/site.ts test/site-schema.test.ts
git commit -m "feat(plugin): add site frontmatter schema"
```

---

## Task 11: Site frontmatter loader — failing test

**Files:**
- Create: `../nextjs-migration-plugin/test/fixtures/site-valid.md`
- Create: `../nextjs-migration-plugin/test/load-site.test.ts`

- [ ] **Step 1: Create fixture**

Create `test/fixtures/site-valid.md`:
```markdown
---
sourceUrl: https://example.com
target: ./
mode: attended
goal: pixel-perfect
inputMode: url-only
---

# example.com migration

Notes about this migration.
```

- [ ] **Step 2: Write failing test**

Create `test/load-site.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadSite } from "../lib/load-site.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadSite", () => {
  it("parses frontmatter and body from SITE.md", () => {
    const result = loadSite(fixturePath("site-valid.md"));
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.site.sourceUrl).toBe("https://example.com");
      expect(result.site.mode).toBe("attended");
      expect(result.body.trim().startsWith("# example.com migration")).toBe(true);
    }
  });

  it("returns invalid result when required field is missing", () => {
    const { writeFileSync, mkdtempSync } = require("node:fs");
    const { tmpdir } = require("node:os");
    const { join } = require("node:path");
    const dir = mkdtempSync(join(tmpdir(), "site-test-"));
    const path = join(dir, "SITE.md");
    writeFileSync(path, "---\ntarget: ./\n---\n\n# no source URL");
    const result = loadSite(path);
    expect(result.valid).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Expected: FAIL with module-not-found.

---

## Task 12: Site frontmatter loader — implementation

**Files:**
- Create: `../nextjs-migration-plugin/lib/load-site.ts`

- [ ] **Step 1: Implement the loader**

Create `lib/load-site.ts`:
```typescript
import { readFileSync } from "node:fs";
import matter from "gray-matter";
import { SiteFrontmatterSchema, type SiteFrontmatter } from "../schemas/site.ts";
import type { z } from "zod";

export type SiteLoadResult =
  | { valid: true; site: SiteFrontmatter; body: string }
  | { valid: false; issues: z.ZodIssue[]; rawFrontmatter: unknown; path: string };

export function loadSite(path: string): SiteLoadResult {
  const contents = readFileSync(path, "utf8");
  const parsed = matter(contents);
  const result = SiteFrontmatterSchema.safeParse(parsed.data);
  if (result.success) {
    return { valid: true, site: result.data, body: parsed.content };
  }
  return {
    valid: false,
    issues: result.error.issues,
    rawFrontmatter: parsed.data,
    path,
  };
}
```

- [ ] **Step 2: Run test**

Expected: PASS (2 tests).

- [ ] **Step 3: Commit**

```bash
git add lib/load-site.ts test/load-site.test.ts test/fixtures/site-valid.md
git commit -m "feat(plugin): add SITE.md loader with frontmatter parsing"
```

---

## Task 13: Bootstrap function — failing test

**Files:**
- Create: `../nextjs-migration-plugin/test/bootstrap.test.ts`

- [ ] **Step 1: Write failing test**

Create `test/bootstrap.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootstrapMigration } from "../lib/bootstrap.ts";

describe("bootstrapMigration", () => {
  it("creates .migration/ skeleton in target dir", async () => {
    const target = mkdtempSync(join(tmpdir(), "bootstrap-"));
    await bootstrapMigration({
      targetDir: target,
      site: {
        sourceUrl: "https://example.com",
        target: "./",
        mode: "attended",
        goal: "pixel-perfect",
        inputMode: "url-only",
        maxParallelPages: 4,
        maxParallelSections: 4,
      },
    });

    expect(existsSync(join(target, ".migration"))).toBe(true);
    expect(existsSync(join(target, ".migration/SITE.md"))).toBe(true);
    expect(existsSync(join(target, ".migration/library"))).toBe(true);
    expect(existsSync(join(target, ".migration/pages"))).toBe(true);
    expect(existsSync(join(target, ".migration/runs/001-initial"))).toBe(true);
    expect(existsSync(join(target, ".migration/runs/001-initial/RUN.md"))).toBe(true);
  });

  it("writes SITE.md with the provided frontmatter", async () => {
    const target = mkdtempSync(join(tmpdir(), "bootstrap-"));
    await bootstrapMigration({
      targetDir: target,
      site: {
        sourceUrl: "https://example.com",
        target: "./",
        mode: "unattended",
        goal: "wireframe",
        inputMode: "url-only",
        maxParallelPages: 4,
        maxParallelSections: 4,
      },
    });
    const contents = readFileSync(join(target, ".migration/SITE.md"), "utf8");
    expect(contents).toContain("sourceUrl: https://example.com");
    expect(contents).toContain("mode: unattended");
    expect(contents).toContain("goal: wireframe");
  });

  it("refuses to overwrite existing .migration/", async () => {
    const target = mkdtempSync(join(tmpdir(), "bootstrap-"));
    const site = {
      sourceUrl: "https://example.com", target: "./",
      mode: "attended" as const, goal: "pixel-perfect" as const, inputMode: "url-only" as const,
      maxParallelPages: 4, maxParallelSections: 4,
    };
    await bootstrapMigration({ targetDir: target, site });
    await expect(bootstrapMigration({ targetDir: target, site })).rejects.toThrow(/already exists/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Expected: FAIL with module-not-found.

---

## Task 14: Bootstrap function — implementation

**Files:**
- Create: `../nextjs-migration-plugin/lib/bootstrap.ts`

- [ ] **Step 1: Implement**

Create `lib/bootstrap.ts`:
```typescript
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import type { SiteFrontmatter } from "../schemas/site.ts";

export interface BootstrapArgs {
  targetDir: string;
  site: SiteFrontmatter;
  description?: string;
}

export async function bootstrapMigration(args: BootstrapArgs): Promise<void> {
  const migrationDir = join(args.targetDir, ".migration");
  if (existsSync(migrationDir)) {
    throw new Error(`.migration/ already exists in ${args.targetDir}`);
  }

  mkdirSync(migrationDir, { recursive: true });
  mkdirSync(join(migrationDir, "library"), { recursive: true });
  mkdirSync(join(migrationDir, "pages"), { recursive: true });
  mkdirSync(join(migrationDir, "runs/001-initial"), { recursive: true });

  const frontmatter = matter.stringify(
    args.description ?? `# ${args.site.sourceUrl} migration\n`,
    args.site,
  );
  writeFileSync(join(migrationDir, "SITE.md"), frontmatter);

  writeFileSync(
    join(migrationDir, "runs/001-initial/RUN.md"),
    `# Run 001 — initial\n\nScope: initial migration of ${args.site.sourceUrl}\n\nGoal: ${args.site.goal}\nMode: ${args.site.mode}\n`,
  );

  writeFileSync(
    join(migrationDir, "REPORT.md"),
    `# Migration Report\n\n_Accumulated across all runs._\n`,
  );
}
```

- [ ] **Step 2: Run test to verify it passes**

Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add lib/bootstrap.ts test/bootstrap.test.ts
git commit -m "feat(plugin): add .migration/ bootstrap function"
```

---

## Task 15: new-migration CLI entry — failing test

**Files:**
- Create: `../nextjs-migration-plugin/test/new-migration.test.ts`

- [ ] **Step 1: Write failing test**

Create `test/new-migration.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runNewMigration } from "../lib/new-migration.ts";

describe("runNewMigration", () => {
  it("creates .migration/ with correct frontmatter from args", async () => {
    const target = mkdtempSync(join(tmpdir(), "newmig-"));
    await runNewMigration({
      sourceUrl: "https://example.com",
      targetDir: target,
      mode: "attended",
      goal: "pixel-perfect",
      inputMode: "url-only",
    });
    const site = readFileSync(join(target, ".migration/SITE.md"), "utf8");
    expect(site).toContain("sourceUrl: https://example.com");
    expect(site).toContain("goal: pixel-perfect");
  });

  it("passes sourceRepo through when inputMode is url-plus-repo", async () => {
    const target = mkdtempSync(join(tmpdir(), "newmig-"));
    await runNewMigration({
      sourceUrl: "https://example.com",
      targetDir: target,
      mode: "attended",
      goal: "pixel-perfect",
      inputMode: "url-plus-repo",
      sourceRepo: "/tmp/source-repo",
    });
    const site = readFileSync(join(target, ".migration/SITE.md"), "utf8");
    expect(site).toContain("inputMode: url-plus-repo");
    expect(site).toContain("sourceRepo: /tmp/source-repo");
  });

  it("rejects when targetDir already has .migration/", async () => {
    const target = mkdtempSync(join(tmpdir(), "newmig-"));
    await runNewMigration({
      sourceUrl: "https://example.com",
      targetDir: target,
      mode: "attended",
      goal: "pixel-perfect",
      inputMode: "url-only",
    });
    await expect(runNewMigration({
      sourceUrl: "https://example.com",
      targetDir: target,
      mode: "attended",
      goal: "pixel-perfect",
      inputMode: "url-only",
    })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Expected: FAIL, module-not-found.

---

## Task 16: new-migration CLI entry — implementation

**Files:**
- Create: `../nextjs-migration-plugin/lib/new-migration.ts`

- [ ] **Step 1: Implement**

Create `lib/new-migration.ts`:
```typescript
import { SiteFrontmatterSchema } from "../schemas/site.ts";
import { bootstrapMigration } from "./bootstrap.ts";

export interface NewMigrationArgs {
  sourceUrl: string;
  targetDir: string;
  mode: "attended" | "unattended";
  goal: "wireframe" | "pixel-perfect";
  inputMode: "url-only" | "url-plus-repo";
  sourceRepo?: string;
}

export async function runNewMigration(args: NewMigrationArgs): Promise<void> {
  const site = SiteFrontmatterSchema.parse({
    sourceUrl: args.sourceUrl,
    target: "./",
    mode: args.mode,
    goal: args.goal,
    inputMode: args.inputMode,
    sourceRepo: args.sourceRepo,
  });

  await bootstrapMigration({ targetDir: args.targetDir, site });
}

// CLI shim: allow invocation via `tsx lib/new-migration.ts --url ... --target ...`
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  runNewMigration(args).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

function parseArgs(argv: string[]): NewMigrationArgs {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const sourceUrl = get("--url");
  const targetDir = get("--target") ?? process.cwd();
  const mode = (get("--mode") ?? "attended") as "attended" | "unattended";
  const goal = (get("--goal") ?? "pixel-perfect") as "wireframe" | "pixel-perfect";
  const inputMode = (get("--input-mode") ?? "url-only") as "url-only" | "url-plus-repo";
  const sourceRepo = get("--source-repo");
  if (!sourceUrl) throw new Error("--url is required");
  return { sourceUrl, targetDir, mode, goal, inputMode, sourceRepo };
}
```

- [ ] **Step 2: Run test**

Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add lib/new-migration.ts test/new-migration.test.ts
git commit -m "feat(plugin): add /migrate:new entry point"
```

---

## Task 17: Status function — failing test + implementation

**Files:**
- Create: `../nextjs-migration-plugin/test/status.test.ts`
- Create: `../nextjs-migration-plugin/lib/status.ts`

- [ ] **Step 1: Write failing test**

Create `test/status.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getStatus } from "../lib/status.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";

const baseSite = {
  sourceUrl: "https://example.com",
  target: "./",
  mode: "attended" as const,
  goal: "pixel-perfect" as const,
  inputMode: "url-only" as const,
  maxParallelPages: 4,
  maxParallelSections: 4,
};

describe("getStatus", () => {
  it("returns { initialized: false } when .migration/ does not exist", async () => {
    const target = mkdtempSync(join(tmpdir(), "status-"));
    const status = await getStatus(target);
    expect(status.initialized).toBe(false);
  });

  it("returns { initialized: true, site, activeRun } after bootstrap", async () => {
    const target = mkdtempSync(join(tmpdir(), "status-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    const status = await getStatus(target);
    expect(status.initialized).toBe(true);
    if (status.initialized) {
      expect(status.site.sourceUrl).toBe("https://example.com");
      expect(status.activeRun).toBe("001-initial");
      expect(status.completedPhases).toEqual([]);
    }
  });

  it("reports completedPhases based on VERIFICATION.md presence", async () => {
    const target = mkdtempSync(join(tmpdir(), "status-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    const phaseDir = join(target, ".migration/runs/001-initial/phase-1-discover");
    mkdirSync(phaseDir, { recursive: true });
    writeFileSync(join(phaseDir, "VERIFICATION.md"), "# Verified\n\nStatus: passed\n");
    const status = await getStatus(target);
    if (status.initialized) {
      expect(status.completedPhases).toContain("phase-1-discover");
    }
  });
});
```

- [ ] **Step 2: Run — expect fail (module not found)**

- [ ] **Step 3: Implement status**

Create `lib/status.ts`:
```typescript
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadSite } from "./load-site.ts";
import type { SiteFrontmatter } from "../schemas/site.ts";

export type Status =
  | { initialized: false }
  | {
      initialized: true;
      site: SiteFrontmatter;
      activeRun: string;
      completedPhases: string[];
    };

export async function getStatus(targetDir: string): Promise<Status> {
  const migrationDir = join(targetDir, ".migration");
  if (!existsSync(migrationDir)) return { initialized: false };

  const siteResult = loadSite(join(migrationDir, "SITE.md"));
  if (!siteResult.valid) {
    throw new Error(`SITE.md is invalid: ${JSON.stringify(siteResult.issues)}`);
  }

  const runsDir = join(migrationDir, "runs");
  const runs = existsSync(runsDir) ? readdirSync(runsDir).sort() : [];
  const activeRun = runs[runs.length - 1] ?? "001-initial";

  const activeRunDir = join(runsDir, activeRun);
  const completedPhases: string[] = [];
  if (existsSync(activeRunDir)) {
    for (const entry of readdirSync(activeRunDir)) {
      if (entry.startsWith("phase-") && existsSync(join(activeRunDir, entry, "VERIFICATION.md"))) {
        completedPhases.push(entry);
      }
    }
  }

  return { initialized: true, site: siteResult.site, activeRun, completedPhases };
}
```

- [ ] **Step 4: Run test**

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/status.ts test/status.test.ts
git commit -m "feat(plugin): add /migrate:status logic"
```

---

## Task 18: Config function — failing test + implementation

**Files:**
- Create: `../nextjs-migration-plugin/test/config.test.ts`
- Create: `../nextjs-migration-plugin/lib/config.ts`

- [ ] **Step 1: Write failing test**

Create `test/config.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setConfig } from "../lib/config.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";

const baseSite = {
  sourceUrl: "https://example.com",
  target: "./",
  mode: "attended" as const,
  goal: "pixel-perfect" as const,
  inputMode: "url-only" as const,
  maxParallelPages: 4,
  maxParallelSections: 4,
};

describe("setConfig", () => {
  it("updates mode from attended to unattended", async () => {
    const target = mkdtempSync(join(tmpdir(), "config-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    await setConfig(target, "mode", "unattended");
    const site = readFileSync(join(target, ".migration/SITE.md"), "utf8");
    expect(site).toContain("mode: unattended");
    expect(site).not.toContain("mode: attended");
  });

  it("rejects invalid key", async () => {
    const target = mkdtempSync(join(tmpdir(), "config-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    await expect(setConfig(target, "notAKey", "whatever")).rejects.toThrow(/unknown config key/i);
  });

  it("rejects invalid value for enum key", async () => {
    const target = mkdtempSync(join(tmpdir(), "config-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    await expect(setConfig(target, "mode", "bogus")).rejects.toThrow();
  });

  it("coerces numeric values for parallelism keys", async () => {
    const target = mkdtempSync(join(tmpdir(), "config-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    await setConfig(target, "maxParallelPages", "8");
    const site = readFileSync(join(target, ".migration/SITE.md"), "utf8");
    expect(site).toContain("maxParallelPages: 8");
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement config**

Create `lib/config.ts`:
```typescript
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { SiteFrontmatterSchema } from "../schemas/site.ts";

const NUMERIC_KEYS = new Set(["maxParallelPages", "maxParallelSections"]);
const ALLOWED_KEYS = new Set([
  "mode", "goal", "inputMode", "sourceRepo", "maxParallelPages", "maxParallelSections",
]);

export async function setConfig(targetDir: string, key: string, value: string): Promise<void> {
  if (!ALLOWED_KEYS.has(key)) {
    throw new Error(`Unknown config key: ${key}`);
  }
  const sitePath = join(targetDir, ".migration/SITE.md");
  const contents = readFileSync(sitePath, "utf8");
  const parsed = matter(contents);

  const next = { ...parsed.data, [key]: NUMERIC_KEYS.has(key) ? Number(value) : value };
  const validation = SiteFrontmatterSchema.safeParse(next);
  if (!validation.success) {
    throw new Error(`Invalid value for ${key}: ${validation.error.issues.map(i => i.message).join("; ")}`);
  }

  const updated = matter.stringify(parsed.content, validation.data);
  writeFileSync(sitePath, updated);
}
```

- [ ] **Step 4: Run test**

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/config.ts test/config.test.ts
git commit -m "feat(plugin): add /migrate:config logic"
```

---

## Task 19: Session-start dep check — failing test + implementation

**Files:**
- Create: `../nextjs-migration-plugin/test/session-check.test.ts`
- Create: `../nextjs-migration-plugin/lib/session-check.ts`
- Create: `../nextjs-migration-plugin/hooks/session-start.js`

- [ ] **Step 1: Write failing test**

Create `test/session-check.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { checkPluginDependencies } from "../lib/session-check.ts";

describe("checkPluginDependencies", () => {
  it("returns { ok: true } when superpowers is present", () => {
    const result = checkPluginDependencies({
      installedPlugins: ["superpowers", "some-other-plugin"],
      required: ["superpowers"],
    });
    expect(result.ok).toBe(true);
  });

  it("returns { ok: false, missing } when a required plugin is absent", () => {
    const result = checkPluginDependencies({
      installedPlugins: ["some-other-plugin"],
      required: ["superpowers"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toEqual(["superpowers"]);
    }
  });

  it("returns a helpful message string on missing deps", () => {
    const result = checkPluginDependencies({
      installedPlugins: [],
      required: ["superpowers"],
    });
    if (!result.ok) {
      expect(result.message).toContain("superpowers");
      expect(result.message).toContain("install");
    }
  });
});
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement check logic**

Create `lib/session-check.ts`:
```typescript
export interface CheckArgs {
  installedPlugins: string[];
  required: string[];
}

export type CheckResult =
  | { ok: true }
  | { ok: false; missing: string[]; message: string };

export function checkPluginDependencies(args: CheckArgs): CheckResult {
  const missing = args.required.filter(r => !args.installedPlugins.includes(r));
  if (missing.length === 0) return { ok: true };
  const list = missing.map(m => `'${m}'`).join(", ");
  return {
    ok: false,
    missing,
    message: `nextjs-migration-plugin requires the following plugins to be installed: ${list}. Run: claude plugin install ${missing.join(" ")}`,
  };
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Write the hook as pure JS with inlined logic**

Create `hooks/session-start.js`:
```javascript
#!/usr/bin/env node
import { execSync } from "node:child_process";

const REQUIRED = ["superpowers"];

function listInstalledPlugins() {
  try {
    const output = execSync("claude plugin list --json", { encoding: "utf8" });
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? parsed.map(p => p.name) : [];
  } catch {
    return [];
  }
}

const installed = listInstalledPlugins();
const missing = REQUIRED.filter(r => !installed.includes(r));

if (missing.length > 0) {
  const list = missing.map(m => `'${m}'`).join(", ");
  console.error(
    `[nextjs-migration-plugin] Missing required plugins: ${list}. ` +
    `Run: claude plugin install ${missing.join(" ")}`
  );
  process.exit(1);
}
```

The hook is pure JS — no TypeScript imports — so it runs at session start without a build step. The equivalent logic is TDD-tested in `lib/session-check.ts`; the hook is a thin CLI glue over the same rule (both encode "missing deps → error message listing them"). If the shared rule changes, update both.

- [ ] **Step 6: Commit**

```bash
git add lib/session-check.ts test/session-check.test.ts hooks/session-start.js
git commit -m "feat(plugin): add session-start dep validation"
```

---

## Task 20: Vendor scripts, adapters, and lessons from old repo

**Files:**
- Copy: `../nextjs-migration-agent/scripts/*` → `scripts/`
- Copy: `../nextjs-migration-agent/.ai/adapters/*` → `adapters/`
- Copy: `../nextjs-migration-agent/.ai/lessons.md` → `knowledge/lessons.md`

- [ ] **Step 1: Vendor scripts**

```bash
cd /Users/blazity/dev/nextjs-migration-plugin
mkdir -p scripts
cp -r ../nextjs-migration-agent/scripts/* scripts/
```

- [ ] **Step 2: Vendor adapters**

```bash
mkdir -p adapters
cp ../nextjs-migration-agent/.ai/adapters/* adapters/
```

Verify: `ls adapters/*.json | wc -l` should be ~24.

- [ ] **Step 3: Vendor knowledge**

```bash
mkdir -p knowledge/phase-pitfalls
cp ../nextjs-migration-agent/.ai/lessons.md knowledge/lessons.md
```

- [ ] **Step 4: Validate vendored adapters parse**

Write a quick smoke test. Create `test/vendored-adapters.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadAdapter } from "../lib/load-adapter.ts";

const adaptersDir = fileURLToPath(new URL("../adapters/", import.meta.url));

describe("vendored adapters", () => {
  const adapterFiles = readdirSync(adaptersDir).filter(f => f.endsWith(".json"));

  adapterFiles.forEach(file => {
    it(`${file} validates against AdapterSchema`, () => {
      const result = loadAdapter(join(adaptersDir, file));
      if (!result.valid) {
        console.error(`Adapter ${file} has issues:`, result.issues);
      }
      expect(result.valid).toBe(true);
    });
  });
});
```

- [ ] **Step 5: Run vendored-adapter tests**

```bash
pnpm test test/vendored-adapters.test.ts
```

Expected: Every vendored adapter passes. If any fails, either the adapter's real JSON doesn't match the Zod schema (schema needs widening) or the adapter has a genuine problem (fix the adapter). Either way, resolve inline before continuing — this is the first real integration signal.

- [ ] **Step 6: Commit**

```bash
git add scripts adapters knowledge test/vendored-adapters.test.ts
git commit -m "chore(plugin): vendor scripts, adapters, and lessons from agent repo"
```

---

## Task 21: Write plugin.json manifest

**Files:**
- Create: `../nextjs-migration-plugin/plugin.json`

- [ ] **Step 1: Write manifest**

Create `plugin.json`:
```json
{
  "name": "nextjs-migration-plugin",
  "version": "0.0.1",
  "description": "Multi-page Next.js migration via phased, stateful agents.",
  "author": "Blazity",
  "dependencies": [
    "superpowers"
  ],
  "hooks": {
    "SessionStart": "hooks/session-start.js"
  },
  "commands": "commands/",
  "skills": "skills/",
  "agents": "agents/"
}
```

- [ ] **Step 2: Commit**

```bash
git add plugin.json
git commit -m "feat(plugin): add plugin.json manifest"
```

---

## Task 22: Write /migrate:new skill + command

**Files:**
- Create: `../nextjs-migration-plugin/commands/migrate-new.md`
- Create: `../nextjs-migration-plugin/skills/migrate-new/SKILL.md`

- [ ] **Step 1: Write command**

Create `commands/migrate-new.md`:
```markdown
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
```

- [ ] **Step 2: Write skill**

Create `skills/migrate-new/SKILL.md`:
```markdown
---
name: migrate-new
description: Wizard intake for a new migration. Asks four questions with sensible defaults, then creates .migration/.
---

# /migrate:new

You are starting a new Next.js migration. The user has provided a source URL as the first positional argument and optionally a `--source-repo <path>` flag.

## Step 1 — Ask the four wizard questions

All four are skippable with Enter (accept default).

1. **Target directory.** Check if the current working directory is empty. If non-empty, ask: "Use current dir or `./[slugified-domain]/`?" Default: subfolder if CWD is non-empty, current dir if empty.

2. **Source code access** (skip if `--source-repo` was already passed). Ask: "Do you have the source code repo? Path (optional):" Default: skip, use `inputMode: url-only`. If provided, use `inputMode: url-plus-repo`.

3. **Goal.** Ask: "Goal — wireframe (fast ~80%) or pixel-perfect (slow, production)? [pixel-perfect]" Default: `pixel-perfect`.

4. **Mode.** Ask: "Run in attended or unattended mode? [attended]" Default: `attended`.

## Step 2 — Invoke the entry script

Run the Node entry point with collected answers:

```bash
tsx ${PLUGIN_DIR}/lib/new-migration.ts \
  --url "${URL}" \
  --target "${TARGET_DIR}" \
  --mode "${MODE}" \
  --goal "${GOAL}" \
  --input-mode "${INPUT_MODE}" \
  ${SOURCE_REPO:+--source-repo "${SOURCE_REPO}"}
```

If `${PLUGIN_DIR}` is not set by the harness, resolve it from the plugin install path.

## Step 3 — Report success

On success, print:

> Migration initialized at `[TARGET_DIR]/.migration/`. Run `/migrate:continue` to begin, or `/migrate:discover` to run the first phase explicitly.

If the entry script fails (e.g., `.migration/` already exists), surface the error message verbatim and stop.

## Step 4 — Do not proceed to other phases

This skill ONLY bootstraps the migration. Do not automatically invoke `/migrate:discover` or any other phase. That's the user's call.
```

- [ ] **Step 3: Commit**

```bash
git add commands/migrate-new.md skills/migrate-new/SKILL.md
git commit -m "feat(plugin): add /migrate:new skill and command"
```

---

## Task 23: Write /migrate:status skill + command

**Files:**
- Create: `../nextjs-migration-plugin/commands/migrate-status.md`
- Create: `../nextjs-migration-plugin/skills/migrate-status/SKILL.md`

- [ ] **Step 1: Write command**

Create `commands/migrate-status.md`:
```markdown
---
name: migrate:status
description: Print current migration state — phases complete, pages progressed, blockers.
---

Invoke the `migrate-status` skill.
```

- [ ] **Step 2: Write skill**

Create `skills/migrate-status/SKILL.md`:
```markdown
---
name: migrate-status
description: Prints a concise status overview of the current migration.
---

# /migrate:status

Read the current migration state and print a short human-readable summary.

## Step 1 — Invoke status script

```bash
tsx ${PLUGIN_DIR}/lib/status.ts --target "${PWD}"
```

Alternatively, since the logic is simple, you may read `.migration/SITE.md` and `.migration/runs/` directly and format output yourself — but prefer the script to avoid drift.

## Step 2 — Format output

If `initialized: false`: print "No migration in this directory. Run `/migrate:new <url>` to start."

If `initialized: true`: print:

```
Migration: [sourceUrl]
Mode: [mode] | Goal: [goal] | Input: [inputMode]
Active run: [activeRun]
Completed phases: [completedPhases.join(", ") or "none yet"]
```

Then suggest the next command based on state — typically `/migrate:continue` unless all phases are done.
```

- [ ] **Step 3: Add a CLI shim to lib/status.ts**

Append to `lib/status.ts`:
```typescript
if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv.includes("--target")
    ? process.argv[process.argv.indexOf("--target") + 1]
    : process.cwd();
  getStatus(target).then(status => {
    console.log(JSON.stringify(status, null, 2));
  }).catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
```

Re-run `pnpm test test/status.test.ts` to confirm the shim didn't break existing tests.

- [ ] **Step 4: Commit**

```bash
git add commands/migrate-status.md skills/migrate-status/SKILL.md lib/status.ts
git commit -m "feat(plugin): add /migrate:status skill and command"
```

---

## Task 24: Write /migrate:config skill + command

**Files:**
- Create: `../nextjs-migration-plugin/commands/migrate-config.md`
- Create: `../nextjs-migration-plugin/skills/migrate-config/SKILL.md`

- [ ] **Step 1: Write command**

Create `commands/migrate-config.md`:
```markdown
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
```

- [ ] **Step 2: Write skill**

Create `skills/migrate-config/SKILL.md`:
```markdown
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
```

- [ ] **Step 3: Add CLI shim to lib/config.ts**

Append to `lib/config.ts`:
```typescript
if (import.meta.url === `file://${process.argv[1]}`) {
  const get = (flag: string) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const target = get("--target") ?? process.cwd();
  const key = get("--key");
  const value = get("--value");
  if (!key || value === undefined) {
    console.error("Usage: config --target <dir> --key <k> --value <v>");
    process.exit(1);
  }
  setConfig(target, key, value).then(() => {
    console.log(`Updated: ${key} = ${value}`);
  }).catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
```

Re-run `pnpm test test/config.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add commands/migrate-config.md skills/migrate-config/SKILL.md lib/config.ts
git commit -m "feat(plugin): add /migrate:config skill and command"
```

---

## Task 25: Write adapter-repairer agent prompt

**Files:**
- Create: `../nextjs-migration-plugin/agents/adapter-repairer.md`

- [ ] **Step 1: Write the agent prompt**

Create `agents/adapter-repairer.md`:
```markdown
---
name: adapter-repairer
description: Repairs a Zod-invalid adapter JSON file to satisfy AdapterSchema. Dispatched by any phase that loads an adapter and receives a diagnostic result.
---

# Adapter Repairer Agent

You are fixing a JSON adapter file that failed Zod validation. You will be given:

1. **`issues`** — array of ZodIssue objects (each has `path`, `code`, `message`, and often `expected` / `received`)
2. **`rawJson`** — the raw parsed JSON that failed (may be literally anything, including malformed structures)
3. **`path`** — filesystem path where the corrected JSON should be written
4. **Schema source** — the Zod schema definition file, for your reference

## Your task

Rewrite the adapter JSON at `path` so it satisfies the schema.

## Rules

1. **Only fix format issues.** Missing required fields → infer from surrounding context (adapter name, type, existing fields) and add. Wrong types → coerce or infer. Unknown keys → remove if clearly stale, rename if they're a typo of a valid key.
2. **Never change semantic intent.** If a CSS selector is present but incorrect for real-world use, that's not your problem — a different gate (adapter validation CI) catches that. You only fix schema violations.
3. **Preserve existing valid fields verbatim.** Only touch what needs fixing.
4. **When in doubt, use sensible defaults.** E.g., if `sectionDiscovery.unwrap` is missing and the adapter is for a framework known to nest sections deeply, default to `true`. Otherwise `false`.
5. **Write the corrected JSON back to `path` as pretty-printed JSON with 2-space indent.**

## What you MUST NOT do

- Do not invent adapters that don't exist (e.g., do not create an "adapter from scratch" if `rawJson` is nearly empty — that's a schema bug, not a repair case)
- Do not delete the file
- Do not write to any path other than the provided one
- Do not modify the schema file itself

## Output

After writing the file, output a one-line summary of what you changed, e.g.:

> Added missing `version: "1.0.0"` and corrected `type` from `"lib"` → `"framework"`.
```

- [ ] **Step 2: Commit**

```bash
git add agents/adapter-repairer.md
git commit -m "feat(plugin): add adapter-repairer agent prompt"
```

---

## Task 26: Flesh out README with install + smoke test instructions

**Files:**
- Modify: `../nextjs-migration-plugin/README.md`

- [ ] **Step 1: Replace README with full content**

Overwrite `README.md`:
```markdown
# nextjs-migration-plugin

Claude Code plugin for pixel-perfect, multi-page Next.js migrations.

Point it at a URL, answer a few wizard questions, get a production-ready Next.js site with shared layouts, a deduped component library, cross-page routing, and <1% visual diff.

## Status

**Pre-release.** Foundation only — commands `migrate:new`, `migrate:status`, `migrate:config` work. Phases are not yet implemented (see `.ai/plans/` in the companion repo).

## Prerequisites

- Claude Code CLI installed
- `superpowers` plugin installed (hard dependency)
- Node.js ≥22 and pnpm on your machine (scripts shell out to `tsx`)
- Playwright MCP configured (needed once phases land — not required for this release)

## Install

```bash
claude plugin install ./path/to/nextjs-migration-plugin
```

or, from a git URL once published:

```bash
claude plugin install github:blazity/nextjs-migration-plugin
```

Session start will fail with a clear message if `superpowers` is missing.

## Usage (foundation)

```bash
cd ~/dev/my-new-site
claude
# in Claude Code:
/migrate:new https://example.com
```

Answer up to four wizard questions (all have defaults). The plugin creates `.migration/` in your current directory with `SITE.md` and a `runs/001-initial/` scaffold.

```
/migrate:status        # print current state
/migrate:config mode unattended   # flip a setting
```

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
```

## Architecture

See the design spec in the companion repo: `nextjs-migration-agent/docs/specs/2026-04-21-migration-plugin-design.md`.

## License

TBD
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(plugin): flesh out README with install and usage"
```

---

## Task 27: Final verification — full test + typecheck run

- [ ] **Step 1: Run the full test suite**

```bash
cd ../nextjs-migration-plugin
pnpm test
```

Expected: All tests pass. Concretely:
- `adapter-schema.test.ts` — 3 tests
- `load-adapter.test.ts` — 3 tests
- `load-adapter-with-repair.test.ts` — 3 tests
- `site-schema.test.ts` — 6 tests
- `load-site.test.ts` — 2 tests
- `bootstrap.test.ts` — 3 tests
- `new-migration.test.ts` — 3 tests
- `status.test.ts` — 3 tests
- `config.test.ts` — 4 tests
- `session-check.test.ts` — 3 tests
- `vendored-adapters.test.ts` — ~24 tests (one per adapter)

Total: ~57 tests, all passing.

- [ ] **Step 2: Typecheck passes**

```bash
pnpm typecheck
```

Expected: exits 0.

- [ ] **Step 3: Manual smoke test**

In a terminal outside Claude Code:

```bash
mkdir /tmp/smoke-test-migration
cd /tmp/smoke-test-migration
tsx ~/dev/nextjs-migration-plugin/lib/new-migration.ts \
  --url "https://example.com" \
  --target "/tmp/smoke-test-migration" \
  --mode attended \
  --goal pixel-perfect \
  --input-mode url-only
```

Expected: `.migration/` created with `SITE.md`, `library/`, `pages/`, `runs/001-initial/RUN.md`, `REPORT.md`.

Read `SITE.md` — it should have valid YAML frontmatter matching the Zod schema.

- [ ] **Step 4: Install and smoke test in Claude Code**

Follow the README install instructions. In a fresh Claude Code session in an empty directory, run `/migrate:new https://example.com`. Verify the wizard asks questions and creates `.migration/`.

If the hook fails with "superpowers missing" when superpowers IS installed, investigate whether `claude plugin list --json` output format differs from what `hooks/session-start.js` expects — adjust parsing.

- [ ] **Step 5: Commit any fixes from smoke test**

If the smoke test surfaces integration issues (path resolution in skills, hook parsing, etc.), fix them and commit with `fix(plugin): [specific issue]`.

- [ ] **Step 6: Tag v0.0.1**

```bash
git tag v0.0.1
```

Do not push. Tag locally as a checkpoint.

---

## Self-review — spec coverage

Mapping spec requirements to tasks:

| Spec section | Requirement | Task(s) |
|---|---|---|
| § 3 Plugin shape | Sibling repo with its own git | 1 |
| § 3 | TypeScript toolchain | 2 |
| § 3 | Vendored scripts + adapters + lessons | 20 |
| § 3 | plugin.json with hard dep on superpowers | 21 |
| § 3 | session-start hook validates deps | 19 |
| § 4 State model | `.migration/` layout (SITE.md, library, pages, runs) | 14 (bootstrap) |
| § 4 | SITE.md frontmatter schema | 10 |
| § 4 | Status computed from file presence | 17 |
| § 4 | All JSON files Zod-validated | 4 (adapter), future plans (crawl, analysis) |
| § 7 Adapter schema | Zod AdapterSchema | 4 |
| § 7 | Loader with diagnostic return | 6 |
| § 7 | Auto-repair wrapper (3 attempts) | 8 |
| § 7 | `adapter-repairer` agent prompt | 25 |
| § 8 Knowledge | Ship `knowledge/lessons.md` | 20 |
| § 8 | Phase-pitfalls dir structure | 20 (dir created empty) |
| § 9 Commands | `/migrate:new` wizard | 22 |
| § 9 | `/migrate:status` | 23 |
| § 9 | `/migrate:config` | 24 |
| § 9 | Wizard asks four questions | 22 (skill markdown) |
| § 11 Hybrid analysis | (deferred to Plan 3) | — |
| § 12 Parallelism | (deferred to Plan 2+) | — |

Commands deferred to later plans (in line with the 5-plan split):
- `/migrate:continue` (Plan 2)
- `/migrate:discover`, `:analyze`, `:plan`, `:extract`, `:build` (Plan 2+)
- `/migrate:polish`, `:add-pages`, `:library`, `:runs` (Plan 4)
- `/migrate:verify`, `:ship` (Plan 2+)

Agents deferred to later plans:
- `site-crawler`, `layout-extractor`, `component-deduper`, `prop-classifier`, `route-mapper`, `migration-planner`, `plan-checker` (Plan 3)
- `page-extractor`, `page-builder`, `page-verifier`, `page-animator`, `page-optimizer` (Plan 2, Plan 4)
- `phase-executor`, `phase-verifier` (Plan 2)
- `state-repairer` (Plan 3 when crawl/analysis JSON schemas land)

All spec requirements for Plan 1's foundation scope are covered. No TBDs or placeholder tasks. Types and names are consistent across tasks.

## Ready for execution

Plan complete and saved to `.ai/plans/2026-04-21-plugin-foundation.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints

Which approach?
