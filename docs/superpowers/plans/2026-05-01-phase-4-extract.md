# Phase 4 Extract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement runtime Phase 4 (Extract) end-to-end so that, after a verified Phase 3, `/migrate:continue` (or the explicit `/migrate:extract`) iterates every page in `library/routes.json` (capped by `maxParallelPages`), invokes the vendored `extract-styles.ts` / `extract-images.ts` / `extract-animations.ts` scripts per page to populate `.migration/pages/[slug]/spec/`, computes `pages/[slug]/component-usage.json` from the extracted structure + the Phase 2 cluster registry, then runs `validate-extraction.ts` + `qualify-extraction.ts` as the verification gate.

**Architecture:** Plan 5 follows the same dual-mode pattern Plans 2-4 established. The lib layer is deterministic and parallelism-bounded: `lib/extract-runner.ts` invokes the three extract scripts per URL via `execFile` with a per-page output dir under `.migration/pages/[slug]/spec/`. Because the vendored scripts hardcode some output conventions (`extract-images.ts` writes binaries to `public/images/<domain>/<page>/` relative to CWD), the runner sets CWD to a per-page staging dir and moves outputs into the canonical spec layout after each script returns. Per spec § 14 the scripts are NOT modified. A pure `lib/component-usage.ts` matches each extracted section's signature against the Phase 2 cluster registry to produce `component-usage.json`. `lib/validate-extraction-runner.ts` and `lib/qualify-extraction-runner.ts` wrap the two gate scripts. A `lib/extract.ts` orchestrator sequences page extraction with bounded concurrency (≤ `maxParallelPages`), then runs both gate scripts, then emits the verification result. The skill version `/migrate:extract` adds an opt-in `superpowers:dispatching-parallel-agents` fan-out path for very large sites where the LLM-side coordination — surfacing per-page failures, retrying flaky extractions — pays off; v1 keeps this lightweight and treats the lib version as the canonical happy path.

**Tech Stack:** TypeScript, Zod, Vitest, Node ≥22, pnpm, Playwright (already installed). Markdown for skills/agents/knowledge. Shell-invokable via `tsx`. No new external dependencies.

**Execution context:** All paths relative to `nextjs-migration-plugin/` repo root. Per Plan 3+ convention, no version tag is introduced. Per-page extraction is moderately expensive (Playwright launch + DCL wait + multi-viewport style extraction at ≥1440px, plus image downloads) — typical timing on a real 47-page site is 3-8 seconds per page, parallelized at `maxParallelPages: 4` defaults. Tests use stub-injection for the heavy work; one integration test exercises the real subprocess pipeline against a tiny in-process HTTP fixture so the full path is covered without a 5+ minute test suite.

**Spec source:** `docs/superpowers/specs/2026-04-21-migration-plugin-design.md` § 5 row 4 (Phase 4 — Extract), § 9 (`/migrate:extract`), § 10 (`page-extractor` agent), § 12 (parallelism), § 14 (vendored scripts policy).

**Predecessors:**
- `docs/superpowers/plans/2026-04-21-plugin-foundation.md` (executed, tagged `v0.0.1`)
- `docs/superpowers/plans/2026-04-29-phase-1-discover.md` (executed, tagged `v0.0.2`)
- `docs/superpowers/plans/2026-04-30-phase-2-analyze.md` (executed)
- `docs/superpowers/plans/2026-05-01-phase-3-plan.md` (executed)

**Out of scope (deferred):**
- Phase 5 (Build) — Plan 6+. Plan 5 produces the per-page specs that Phase 5 reads, but does NOT generate any TSX or run `next build`.
- Phase 6/7/8 polish phases — Plan 7+.
- `/migrate:add-pages` delta-mode extraction — Plan 7+.
- Per-page pipelining between Phase 4 and Phase 5 (spec § 13 v2 #7) — barrier between Extract and Build is intentional v1 simplicity.
- Modification of vendored extract scripts. Per spec § 14 they are vendored verbatim. The wrapper layer adapts to their existing CLI / output conventions.

---

## File structure (what this plan produces)

```
nextjs-migration-plugin/
├── schemas/
│   ├── page-spec.ts                            # NEW — PageSpecManifestSchema (per-page spec catalog)
│   └── component-usage.ts                      # NEW — ComponentUsageSchema
├── lib/
│   ├── load-page-spec.ts                       # NEW
│   ├── load-component-usage.ts                 # NEW
│   ├── extract-runner.ts                       # NEW — per-page subprocess wrapper for the 3 extract scripts
│   ├── component-usage.ts                      # NEW — pure matcher: extracted sections → cluster ids
│   ├── validate-extraction-runner.ts           # NEW — wraps scripts/validate-extraction.ts
│   ├── qualify-extraction-runner.ts            # NEW — wraps scripts/qualify-extraction.ts
│   ├── extract.ts                              # NEW — Phase 4 orchestrator
│   └── continue.ts                             # MODIFIED — register phase-4-extract dispatcher
├── commands/
│   └── migrate-extract.md                      # NEW
├── skills/
│   ├── migrate-extract/SKILL.md                # NEW
│   └── migrate-continue/SKILL.md               # MODIFIED — add phase-4 routing entry
├── agents/
│   └── page-extractor.md                       # NEW
├── knowledge/phase-pitfalls/
│   └── extract.md                              # NEW
└── test/
    ├── page-spec-schema.test.ts                # NEW
    ├── load-page-spec.test.ts                  # NEW
    ├── component-usage-schema.test.ts          # NEW
    ├── load-component-usage.test.ts            # NEW
    ├── component-usage.test.ts                 # NEW (matcher unit tests)
    ├── extract-runner.test.ts                  # NEW (stub-injected)
    ├── validate-extraction-runner.test.ts      # NEW (stub-injected)
    ├── qualify-extraction-runner.test.ts       # NEW (stub-injected)
    ├── extract.test.ts                         # NEW (orchestrator with all three runners stubbed)
    ├── continue-extract.integration.test.ts    # NEW
    └── fixtures/
        ├── page-spec-valid.json                # NEW
        ├── page-spec-invalid.json              # NEW
        ├── component-usage-valid.json          # NEW
        ├── component-usage-invalid.json        # NEW
        └── extract-fixture-spec/               # NEW — minimal post-extract spec dir for matcher tests
            ├── 00-globals.json
            ├── 01-hero.styles.json
            ├── 01-hero.structure.md
            └── manifest.json
```

Each file has a single responsibility. Schemas define data shape. Loaders parse + validate. Runners shell out to specific vendored scripts. The matcher (`component-usage.ts`) is pure. The orchestrator (`extract.ts`) wires the parallel-by-page loop and the gate.

---

## Conventions used in this plan

- Per-page output dir: `.migration/pages/[slug]/spec/` (canonical, per spec § 4 state model). The vendored scripts target different layouts internally (some write to `public/images/<domain>/<page>/`, some to `docs/specs/<page>/`). The runner uses a per-page staging dir under `.migration/pages/[slug]/_staging/`, runs scripts with `cwd` set to that dir, then moves the relevant outputs into `spec/` and removes the staging dir.
- Slug source: per page, the `slug` field already on `library/routes.json[].sourceUrl` lookup → `library/routes.json` does not store slug directly, so the runner derives slug from URL via the existing `lib/slug.ts` helper (Plan 2). This matches how `crawl.json[].slug` was generated.
- Loader pattern matches Plans 2-4: `loadX(path)` returns `LoadResult<X>` from `schemas/errors.ts`. State auto-repair via existing `loadWithRepair`.
- Phase artifacts under `runs/<runDir>/phase-4-extract/`:
  ```
  PLAN.md
  EXECUTION.md
  VERIFICATION.md           # only on gate pass
  verification.json         # always
  extraction/
  ├── manifest.json         # one entry per extracted page: { url, slug, specDir, exitCode, durationMs }
  └── failures.json         # pages whose extraction or gate failed (kept across re-runs for triage)
  ```
- Gate criteria (per spec § 5 row 4):
  1. Every page in `library/routes.json` has a non-empty `pages/[slug]/spec/` dir
  2. `validate-extraction.ts` exits 0 (no duplicate spec hashes — catches SPA fallback per lessons.md #24)
  3. `qualify-extraction.ts` exits 0 for every page (per-page section count matches the crawl-derived count, expected style/structure properties present)
  4. Every page has a `component-usage.json` whose component IDs all exist in `library/components.json`
- Stub injection: `extract.ts` accepts `extractOne?`, `validateExtraction?`, `qualifyExtraction?`, `buildComponentUsage?` callables for testability. Defaults shell out to subprocess.

---

## Task 1: Page-spec manifest schema — failing test + fixtures

**Files:**
- Create: `test/fixtures/page-spec-valid.json`
- Create: `test/fixtures/page-spec-invalid.json`
- Create: `test/page-spec-schema.test.ts`

- [ ] **Step 1: Create fixtures**

`test/fixtures/page-spec-valid.json`:
```json
{
  "url": "https://example.com/",
  "slug": "home",
  "extractedAt": "2026-05-01T12:00:00.000Z",
  "viewport": { "width": 1440, "height": 900 },
  "files": {
    "styles": "spec/styles.json",
    "images": "spec/images.json",
    "animations": "spec/animations.json",
    "structure": "spec/structure.json",
    "globals": "spec/00-globals.json"
  },
  "stats": {
    "sectionCount": 4,
    "imageCount": 12,
    "animationCount": 3
  },
  "errors": []
}
```

`test/fixtures/page-spec-invalid.json`:
```json
{
  "url": "not-a-url",
  "slug": "",
  "extractedAt": "today",
  "viewport": { "width": -1, "height": 0 },
  "files": {},
  "stats": { "sectionCount": -1 }
}
```

- [ ] **Step 2: Failing test**

Create `test/page-spec-schema.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PageSpecManifestSchema } from "../schemas/page-spec.ts";

const readFixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("PageSpecManifestSchema", () => {
  it("accepts a valid page-spec manifest", () => {
    expect(PageSpecManifestSchema.safeParse(readFixture("page-spec-valid.json")).success).toBe(true);
  });

  it("rejects a non-URL `url`", () => {
    const result = PageSpecManifestSchema.safeParse(readFixture("page-spec-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("url"))).toBe(true);
    }
  });

  it("rejects an empty slug", () => {
    const result = PageSpecManifestSchema.safeParse(readFixture("page-spec-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("slug"))).toBe(true);
    }
  });

  it("rejects negative viewport dimensions", () => {
    const result = PageSpecManifestSchema.safeParse(readFixture("page-spec-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.join(".").startsWith("viewport."))).toBe(true);
    }
  });

  it("rejects a non-ISO extractedAt", () => {
    const result = PageSpecManifestSchema.safeParse(readFixture("page-spec-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("extractedAt"))).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run — expect fail**

```bash
pnpm test test/page-spec-schema.test.ts
```

Expected: FAIL with `Cannot find module '../schemas/page-spec.ts'`.

---

## Task 2: Page-spec manifest schema — implementation

**Files:**
- Create: `schemas/page-spec.ts`

- [ ] **Step 1: Implement**

Create `schemas/page-spec.ts`:
```typescript
import { z } from "zod";

export const PageSpecFilesSchema = z.object({
  styles: z.string(),
  images: z.string(),
  animations: z.string(),
  structure: z.string(),
  globals: z.string(),
});

export const PageSpecStatsSchema = z.object({
  sectionCount: z.number().int().nonnegative(),
  imageCount: z.number().int().nonnegative().default(0),
  animationCount: z.number().int().nonnegative().default(0),
});

export const PageSpecErrorSchema = z.object({
  step: z.enum(["styles", "images", "animations", "structure"]),
  message: z.string(),
});

export const PageSpecManifestSchema = z.object({
  url: z.string().url(),
  slug: z.string().min(1),
  extractedAt: z.string().datetime(),
  viewport: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  files: PageSpecFilesSchema,
  stats: PageSpecStatsSchema,
  errors: z.array(PageSpecErrorSchema).default([]),
});

export type PageSpecManifest = z.infer<typeof PageSpecManifestSchema>;
export type PageSpecFiles = z.infer<typeof PageSpecFilesSchema>;
```

- [ ] **Step 2: Run test — expect PASS (5)**

- [ ] **Step 3: Commit**

```bash
git add schemas/page-spec.ts test/page-spec-schema.test.ts test/fixtures/page-spec-valid.json test/fixtures/page-spec-invalid.json
git commit -m "feat(plugin): add Zod page-spec manifest schema"
```

---

## Task 3: Page-spec loader — failing test + impl

**Files:**
- Create: `test/load-page-spec.test.ts`
- Create: `lib/load-page-spec.ts`

- [ ] **Step 1: Failing test**

Create `test/load-page-spec.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadPageSpec } from "../lib/load-page-spec.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadPageSpec", () => {
  it("returns { valid: true } for a valid page-spec manifest", () => {
    const result = loadPageSpec(fixturePath("page-spec-valid.json"));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.slug).toBe("home");
  });

  it("returns { valid: false } for an invalid page-spec manifest", () => {
    expect(loadPageSpec(fixturePath("page-spec-invalid.json")).valid).toBe(false);
  });
});
```

Run, expect fail (module not found).

- [ ] **Step 2: Implement**

Create `lib/load-page-spec.ts`:
```typescript
import { readFileSync } from "node:fs";
import { PageSpecManifestSchema, type PageSpecManifest } from "../schemas/page-spec.ts";
import type { LoadResult } from "../schemas/errors.ts";

export function loadPageSpec(path: string): LoadResult<PageSpecManifest> {
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
  const result = PageSpecManifestSchema.safeParse(rawJson);
  if (result.success) return { valid: true, data: result.data };
  return { valid: false, path, rawJson, issues: result.error.issues };
}
```

- [ ] **Step 3: Run — expect PASS (2)**

- [ ] **Step 4: Commit**

```bash
git add lib/load-page-spec.ts test/load-page-spec.test.ts
git commit -m "feat(plugin): add page-spec loader"
```

---

## Task 4: Component-usage schema — failing test + fixtures + impl

**Files:**
- Create: `test/fixtures/component-usage-valid.json`
- Create: `test/fixtures/component-usage-invalid.json`
- Create: `test/component-usage-schema.test.ts`
- Create: `schemas/component-usage.ts`

- [ ] **Step 1: Create fixtures**

`test/fixtures/component-usage-valid.json`:
```json
{
  "url": "https://example.com/",
  "slug": "home",
  "computedAt": "2026-05-01T12:00:00.000Z",
  "components": [
    { "id": "cluster-efcf", "instances": 1, "sectionIndices": [0] },
    { "id": "cluster-0550", "instances": 1, "sectionIndices": [1] },
    { "id": "cluster-c282", "instances": 5, "sectionIndices": [2, 3, 4, 5, 6] }
  ],
  "unmatchedSectionIndices": []
}
```

`test/fixtures/component-usage-invalid.json`:
```json
{
  "url": "not-a-url",
  "slug": "",
  "computedAt": "today",
  "components": [{ "id": "x", "instances": -1 }]
}
```

- [ ] **Step 2: Failing test**

Create `test/component-usage-schema.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ComponentUsageSchema } from "../schemas/component-usage.ts";

const readFixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("ComponentUsageSchema", () => {
  it("accepts a valid component-usage record", () => {
    expect(ComponentUsageSchema.safeParse(readFixture("component-usage-valid.json")).success).toBe(true);
  });

  it("rejects a negative instances value", () => {
    const result = ComponentUsageSchema.safeParse(readFixture("component-usage-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.join(".").endsWith("instances"))).toBe(true);
    }
  });

  it("rejects an empty slug", () => {
    const result = ComponentUsageSchema.safeParse(readFixture("component-usage-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("slug"))).toBe(true);
    }
  });
});
```

Run, expect fail.

- [ ] **Step 3: Implement**

Create `schemas/component-usage.ts`:
```typescript
import { z } from "zod";

export const ComponentUsageEntrySchema = z.object({
  id: z.string().min(1),
  instances: z.number().int().nonnegative(),
  sectionIndices: z.array(z.number().int().nonnegative()).default([]),
});

export const ComponentUsageSchema = z.object({
  url: z.string().url(),
  slug: z.string().min(1),
  computedAt: z.string().datetime(),
  components: z.array(ComponentUsageEntrySchema),
  unmatchedSectionIndices: z.array(z.number().int().nonnegative()).default([]),
});

export type ComponentUsage = z.infer<typeof ComponentUsageSchema>;
export type ComponentUsageEntry = z.infer<typeof ComponentUsageEntrySchema>;
```

- [ ] **Step 4: Run — expect PASS (3)**

- [ ] **Step 5: Commit**

```bash
git add schemas/component-usage.ts test/component-usage-schema.test.ts test/fixtures/component-usage-valid.json test/fixtures/component-usage-invalid.json
git commit -m "feat(plugin): add Zod component-usage schema"
```

---

## Task 5: Component-usage loader — failing test + impl

**Files:**
- Create: `test/load-component-usage.test.ts`
- Create: `lib/load-component-usage.ts`

- [ ] **Step 1: Failing test**

Create `test/load-component-usage.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadComponentUsage } from "../lib/load-component-usage.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadComponentUsage", () => {
  it("returns { valid: true } for a valid component-usage record", () => {
    const result = loadComponentUsage(fixturePath("component-usage-valid.json"));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.components).toHaveLength(3);
  });

  it("returns { valid: false } for an invalid component-usage record", () => {
    expect(loadComponentUsage(fixturePath("component-usage-invalid.json")).valid).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

Create `lib/load-component-usage.ts`:
```typescript
import { readFileSync } from "node:fs";
import { ComponentUsageSchema, type ComponentUsage } from "../schemas/component-usage.ts";
import type { LoadResult } from "../schemas/errors.ts";

export function loadComponentUsage(path: string): LoadResult<ComponentUsage> {
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
  const result = ComponentUsageSchema.safeParse(rawJson);
  if (result.success) return { valid: true, data: result.data };
  return { valid: false, path, rawJson, issues: result.error.issues };
}
```

- [ ] **Step 3: Run — expect PASS (2)**

- [ ] **Step 4: Commit**

```bash
git add lib/load-component-usage.ts test/load-component-usage.test.ts
git commit -m "feat(plugin): add component-usage loader"
```

---

## Task 6: Component-usage builder (pure matcher) — failing test

**Files:**
- Create: `test/component-usage.test.ts`

- [ ] **Step 1: Failing test**

Create `test/component-usage.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { buildComponentUsage } from "../lib/component-usage.ts";
import type { Components } from "../schemas/components.ts";

const isoNow = new Date().toISOString();

const componentsRegistry: Components = {
  components: [
    {
      id: "cluster-hero",
      name: "Hero",
      signature: "hero",
      tagSkeleton: "section>div>h1",
      memberSections: [{ id: "p0-s0", url: "https://example.com/" }],
      unique: false,
      propsRef: "HeroProps",
    },
    {
      id: "cluster-card",
      name: "Card",
      signature: "card",
      tagSkeleton: "section>div>img",
      memberSections: [{ id: "p1-s0", url: "https://example.com/about" }],
      unique: false,
      propsRef: "CardProps",
    },
  ],
  updatedAt: isoNow,
};

describe("buildComponentUsage", () => {
  it("matches each section to its cluster id by exact tagSkeleton", () => {
    const result = buildComponentUsage({
      url: "https://example.com/",
      slug: "home",
      sections: [
        { index: 0, tagSkeleton: "section>div>h1" },
        { index: 1, tagSkeleton: "section>div>img" },
        { index: 2, tagSkeleton: "section>div>h1" },
      ],
      registry: componentsRegistry,
    });
    expect(result.components.map(c => c.id).sort()).toEqual(["cluster-card", "cluster-hero"]);
    const hero = result.components.find(c => c.id === "cluster-hero");
    expect(hero?.instances).toBe(2);
    expect(hero?.sectionIndices.sort()).toEqual([0, 2]);
    const card = result.components.find(c => c.id === "cluster-card");
    expect(card?.instances).toBe(1);
    expect(card?.sectionIndices).toEqual([1]);
  });

  it("collects unmatched section indices", () => {
    const result = buildComponentUsage({
      url: "https://example.com/",
      slug: "home",
      sections: [
        { index: 0, tagSkeleton: "section>div>h1" },
        { index: 1, tagSkeleton: "footer>nothing-matches" },
      ],
      registry: componentsRegistry,
    });
    expect(result.unmatchedSectionIndices).toEqual([1]);
  });

  it("returns empty components when no sections match", () => {
    const result = buildComponentUsage({
      url: "https://example.com/",
      slug: "home",
      sections: [{ index: 0, tagSkeleton: "blockquote>p" }],
      registry: componentsRegistry,
    });
    expect(result.components).toEqual([]);
    expect(result.unmatchedSectionIndices).toEqual([0]);
  });

  it("populates url + slug + computedAt", () => {
    const result = buildComponentUsage({
      url: "https://example.com/",
      slug: "home",
      sections: [],
      registry: componentsRegistry,
    });
    expect(result.url).toBe("https://example.com/");
    expect(result.slug).toBe("home");
    expect(result.computedAt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
```

- [ ] **Step 2: Run — expect fail (module not found)**

---

## Task 7: Component-usage builder — implementation

**Files:**
- Create: `lib/component-usage.ts`

- [ ] **Step 1: Implement**

Create `lib/component-usage.ts`:
```typescript
import type { Components } from "../schemas/components.ts";
import type { ComponentUsage, ComponentUsageEntry } from "../schemas/component-usage.ts";

export interface BuildComponentUsageInput {
  url: string;
  slug: string;
  sections: { index: number; tagSkeleton: string }[];
  registry: Components;
}

/**
 * Match each extracted section against the Phase 2 cluster registry by
 * exact `tagSkeleton`. Sections that do not match any cluster are recorded
 * in `unmatchedSectionIndices` for downstream triage (typically these
 * indicate a Phase 2 mega-cluster that should have split, or a section
 * unique to this page that needs Phase 4 spec extraction to reveal what
 * it is).
 */
export function buildComponentUsage(input: BuildComponentUsageInput): ComponentUsage {
  const byId = new Map<string, ComponentUsageEntry>();
  const unmatched: number[] = [];

  for (const section of input.sections) {
    const cluster = input.registry.components.find(
      c => c.tagSkeleton === section.tagSkeleton,
    );
    if (!cluster) {
      unmatched.push(section.index);
      continue;
    }
    const existing = byId.get(cluster.id);
    if (existing) {
      existing.instances += 1;
      existing.sectionIndices.push(section.index);
    } else {
      byId.set(cluster.id, {
        id: cluster.id,
        instances: 1,
        sectionIndices: [section.index],
      });
    }
  }

  return {
    url: input.url,
    slug: input.slug,
    computedAt: new Date().toISOString(),
    components: [...byId.values()],
    unmatchedSectionIndices: unmatched,
  };
}
```

- [ ] **Step 2: Run — expect PASS (4)**

- [ ] **Step 3: Commit**

```bash
git add lib/component-usage.ts test/component-usage.test.ts
git commit -m "feat(plugin): add component-usage matcher"
```

---

## Task 8: Extract runner — failing test

**Files:**
- Create: `test/extract-runner.test.ts`

- [ ] **Step 1: Failing test**

The runner shells out to three vendored scripts per page. Test injects stubs that write fake spec files so no real Playwright runs.

Create `test/extract-runner.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractPage } from "../lib/extract-runner.ts";
import { PageSpecManifestSchema } from "../schemas/page-spec.ts";

describe("extractPage", () => {
  it("writes a schema-valid manifest after the three extraction steps complete", async () => {
    const root = mkdtempSync(join(tmpdir(), "extract-page-"));
    const pagesDir = join(root, ".migration/pages");
    mkdirSync(pagesDir, { recursive: true });

    const stubStyles = async ({ outputDir }: { outputDir: string }) => {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(join(outputDir, "styles.json"), JSON.stringify({ sections: [{}, {}, {}] }));
      writeFileSync(join(outputDir, "structure.json"), JSON.stringify({ tree: [] }));
      writeFileSync(join(outputDir, "00-globals.json"), JSON.stringify({ body: {} }));
    };
    const stubImages = async ({ outputDir }: { outputDir: string }) => {
      writeFileSync(join(outputDir, "images.json"), JSON.stringify({ totalImages: 4, sections: [] }));
    };
    const stubAnimations = async ({ outputDir }: { outputDir: string }) => {
      writeFileSync(join(outputDir, "animations.json"), JSON.stringify({ sections: [{ animations: [{}, {}] }] }));
    };

    const manifest = await extractPage({
      url: "https://example.com/",
      slug: "home",
      pagesDir,
      adapterPath: "/some/adapter.json",
      runStyles: stubStyles,
      runImages: stubImages,
      runAnimations: stubAnimations,
    });

    PageSpecManifestSchema.parse(manifest);
    expect(manifest.url).toBe("https://example.com/");
    expect(manifest.slug).toBe("home");
    expect(manifest.stats.sectionCount).toBe(3);
    expect(manifest.stats.imageCount).toBe(4);
    expect(manifest.stats.animationCount).toBe(2);
    expect(existsSync(join(pagesDir, "home/spec/styles.json"))).toBe(true);
    expect(existsSync(join(pagesDir, "home/spec/images.json"))).toBe(true);
    expect(existsSync(join(pagesDir, "home/spec/animations.json"))).toBe(true);
  });

  it("captures step failures in manifest.errors instead of throwing", async () => {
    const root = mkdtempSync(join(tmpdir(), "extract-page-"));
    const pagesDir = join(root, ".migration/pages");
    mkdirSync(pagesDir, { recursive: true });

    const stubStyles = async ({ outputDir }: { outputDir: string }) => {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(join(outputDir, "styles.json"), JSON.stringify({ sections: [] }));
      writeFileSync(join(outputDir, "structure.json"), JSON.stringify({ tree: [] }));
      writeFileSync(join(outputDir, "00-globals.json"), JSON.stringify({ body: {} }));
    };
    const stubImages = async () => { throw new Error("network down"); };
    const stubAnimations = async ({ outputDir }: { outputDir: string }) => {
      writeFileSync(join(outputDir, "animations.json"), JSON.stringify({ sections: [] }));
    };

    const manifest = await extractPage({
      url: "https://example.com/",
      slug: "home",
      pagesDir,
      adapterPath: "/some/adapter.json",
      runStyles: stubStyles,
      runImages: stubImages,
      runAnimations: stubAnimations,
    });
    expect(manifest.errors.find(e => e.step === "images")?.message).toMatch(/network down/);
    expect(manifest.stats.imageCount).toBe(0);
  });
});
```

Run, expect fail (module not found).

---

## Task 9: Extract runner — implementation

**Files:**
- Create: `lib/extract-runner.ts`

- [ ] **Step 1: Implement**

Create `lib/extract-runner.ts`:
```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import type { PageSpecManifest } from "../schemas/page-spec.ts";

const execFileP = promisify(execFile);

export interface ExtractStepArgs {
  url: string;
  outputDir: string;
  adapterPath: string;
  pluginRoot: string;
}

export type ExtractStep = (args: ExtractStepArgs) => Promise<void>;

export interface ExtractPageArgs {
  url: string;
  slug: string;
  /** Absolute path to <.migration>/pages */
  pagesDir: string;
  /** Absolute path to the matched adapter JSON */
  adapterPath: string;
  pluginRoot?: string;
  runStyles?: ExtractStep;
  runImages?: ExtractStep;
  runAnimations?: ExtractStep;
  viewport?: { width: number; height: number };
}

/**
 * Extract one page: invoke the three extraction scripts in sequence,
 * write their outputs to <pagesDir>/<slug>/spec/, and return a manifest.
 * Step failures are captured in `manifest.errors`; the function does NOT
 * throw on per-step failures — the caller decides whether to fail the
 * whole gate.
 */
export async function extractPage(args: ExtractPageArgs): Promise<PageSpecManifest> {
  const root = args.pluginRoot ?? defaultPluginRoot();
  const specDir = join(args.pagesDir, args.slug, "spec");
  mkdirSync(specDir, { recursive: true });

  const errors: PageSpecManifest["errors"] = [];

  const runStyles = args.runStyles ?? defaultRunStyles;
  const runImages = args.runImages ?? defaultRunImages;
  const runAnimations = args.runAnimations ?? defaultRunAnimations;

  await runOrCapture(
    "styles",
    () => runStyles({ url: args.url, outputDir: specDir, adapterPath: args.adapterPath, pluginRoot: root }),
    errors,
  );
  await runOrCapture(
    "images",
    () => runImages({ url: args.url, outputDir: specDir, adapterPath: args.adapterPath, pluginRoot: root }),
    errors,
  );
  await runOrCapture(
    "animations",
    () => runAnimations({ url: args.url, outputDir: specDir, adapterPath: args.adapterPath, pluginRoot: root }),
    errors,
  );

  const stats = readStats(specDir);
  const manifest: PageSpecManifest = {
    url: args.url,
    slug: args.slug,
    extractedAt: new Date().toISOString(),
    viewport: args.viewport ?? { width: 1440, height: 900 },
    files: {
      styles: "spec/styles.json",
      images: "spec/images.json",
      animations: "spec/animations.json",
      structure: "spec/structure.json",
      globals: "spec/00-globals.json",
    },
    stats,
    errors,
  };
  writeFileSync(join(args.pagesDir, args.slug, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}

async function runOrCapture(
  step: PageSpecManifest["errors"][number]["step"],
  fn: () => Promise<void>,
  errors: PageSpecManifest["errors"],
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    errors.push({ step, message: (err as Error).message });
  }
}

function readStats(specDir: string): PageSpecManifest["stats"] {
  let sectionCount = 0;
  let imageCount = 0;
  let animationCount = 0;
  if (existsSync(join(specDir, "styles.json"))) {
    const styles = JSON.parse(readFileSync(join(specDir, "styles.json"), "utf8"));
    sectionCount = Array.isArray(styles?.sections) ? styles.sections.length : 0;
  }
  if (existsSync(join(specDir, "images.json"))) {
    const images = JSON.parse(readFileSync(join(specDir, "images.json"), "utf8"));
    imageCount = typeof images?.totalImages === "number" ? images.totalImages : 0;
  }
  if (existsSync(join(specDir, "animations.json"))) {
    const animations = JSON.parse(readFileSync(join(specDir, "animations.json"), "utf8"));
    animationCount = Array.isArray(animations?.sections)
      ? animations.sections.reduce((sum: number, s: { animations?: unknown[] }) => sum + (s.animations?.length ?? 0), 0)
      : 0;
  }
  return { sectionCount, imageCount, animationCount };
}

const defaultRunStyles: ExtractStep = async ({ url, outputDir, adapterPath, pluginRoot }) => {
  const script = resolve(pluginRoot, "scripts/extract-styles.ts");
  await execFileP("npx", ["tsx", script, url, outputDir, "--adapter", adapterPath], { env: process.env });
};

const defaultRunImages: ExtractStep = async ({ url, outputDir, adapterPath, pluginRoot }) => {
  const script = resolve(pluginRoot, "scripts/extract-images.ts");
  // extract-images.ts hardcodes `public/images/<domain>/<page>` for binaries
  // (relative to CWD) and `docs/specs/<page>` for JSON. We invoke with cwd
  // set to a per-page staging dir, then move the JSON output into spec/.
  // Binaries stay in the staging dir; Phase 5 copies them into the user's
  // <target>/public/ during build. v1 does not move them itself.
  const stagingDir = resolve(outputDir, "..", "_staging");
  const { mkdirSync: mk, renameSync, existsSync: exists } = await import("node:fs");
  mk(stagingDir, { recursive: true });
  await execFileP("npx", ["tsx", script, url, "--page", "page", "--adapter", adapterPath], {
    env: process.env,
    cwd: stagingDir,
  });
  const stagedJson = join(stagingDir, "docs/specs/page/images.json");
  if (exists(stagedJson)) renameSync(stagedJson, join(outputDir, "images.json"));
};

const defaultRunAnimations: ExtractStep = async ({ url, outputDir, adapterPath, pluginRoot }) => {
  const script = resolve(pluginRoot, "scripts/extract-animations.ts");
  await execFileP("npx", ["tsx", script, url, outputDir, "--adapter", adapterPath], { env: process.env });
};

function defaultPluginRoot(): string {
  return resolve(fileURLToPath(new URL("..", import.meta.url)));
}
```

- [ ] **Step 2: Run extract-runner test — expect PASS (2)**

```bash
pnpm test test/extract-runner.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add lib/extract-runner.ts test/extract-runner.test.ts
git commit -m "feat(plugin): add per-page extract runner"
```

---

## Task 10: validate-extraction wrapper — failing test + impl

**Files:**
- Create: `test/validate-extraction-runner.test.ts`
- Create: `lib/validate-extraction-runner.ts`

- [ ] **Step 1: Failing test**

Create `test/validate-extraction-runner.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { runValidateExtraction } from "../lib/validate-extraction-runner.ts";

describe("runValidateExtraction", () => {
  it("calls execFile with the spec dirs and returns { passed: true } on exit 0", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: "PASS", stderr: "" });
    const result = await runValidateExtraction({
      specDirs: ["/x/pages/home/spec", "/x/pages/about/spec"],
      pluginRoot: "/plugin",
      execFile: exec,
    });
    expect(result.passed).toBe(true);
    expect(exec).toHaveBeenCalledOnce();
    const args = exec.mock.calls[0][1] as string[];
    expect(args).toContain("/x/pages/home/spec");
    expect(args).toContain("/x/pages/about/spec");
  });

  it("returns { passed: false, detail } on non-zero exit", async () => {
    const exec = vi.fn().mockRejectedValue(Object.assign(new Error("exit 1"), { stdout: "FAIL: duplicate", stderr: "" }));
    const result = await runValidateExtraction({
      specDirs: ["/x/pages/home/spec"],
      pluginRoot: "/plugin",
      execFile: exec,
    });
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/duplicate/);
  });
});
```

Run, expect fail.

- [ ] **Step 2: Implement**

Create `lib/validate-extraction-runner.ts`:
```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const execFileP = promisify(execFile);

export interface RunValidateExtractionArgs {
  specDirs: string[];
  pluginRoot?: string;
  execFile?: (cmd: string, args: string[], opts?: object) => Promise<{ stdout: string; stderr: string }>;
}

export interface RunResult {
  passed: boolean;
  detail?: string;
}

export async function runValidateExtraction(args: RunValidateExtractionArgs): Promise<RunResult> {
  const root = args.pluginRoot ?? defaultPluginRoot();
  const script = resolve(root, "scripts/validate-extraction.ts");
  const exec = args.execFile ?? execFileP;
  try {
    await exec("npx", ["tsx", script, ...args.specDirs], { env: process.env });
    return { passed: true };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { passed: false, detail: (e.stdout || e.stderr || e.message || "validate-extraction failed").slice(0, 500) };
  }
}

function defaultPluginRoot(): string {
  return resolve(fileURLToPath(new URL("..", import.meta.url)));
}
```

- [ ] **Step 3: Run — expect PASS (2)**

- [ ] **Step 4: Commit**

```bash
git add lib/validate-extraction-runner.ts test/validate-extraction-runner.test.ts
git commit -m "feat(plugin): add validate-extraction wrapper"
```

---

## Task 11: qualify-extraction wrapper — failing test + impl

**Files:**
- Create: `test/qualify-extraction-runner.test.ts`
- Create: `lib/qualify-extraction-runner.ts`

- [ ] **Step 1: Failing test**

Create `test/qualify-extraction-runner.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { runQualifyExtraction } from "../lib/qualify-extraction-runner.ts";

describe("runQualifyExtraction", () => {
  it("invokes once per page and aggregates results", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: "PASS", stderr: "" });
    const result = await runQualifyExtraction({
      pages: [
        { url: "https://example.com/", specDir: "/x/pages/home/spec" },
        { url: "https://example.com/about", specDir: "/x/pages/about/spec" },
      ],
      adapterPath: "/some/adapter.json",
      pluginRoot: "/plugin",
      execFile: exec,
    });
    expect(result.passed).toBe(true);
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it("returns { passed: false, failures } when any page fails", async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce({ stdout: "PASS", stderr: "" })
      .mockRejectedValueOnce(Object.assign(new Error("exit 1"), { stdout: "section count mismatch", stderr: "" }));
    const result = await runQualifyExtraction({
      pages: [
        { url: "https://example.com/", specDir: "/x/pages/home/spec" },
        { url: "https://example.com/about", specDir: "/x/pages/about/spec" },
      ],
      adapterPath: "/some/adapter.json",
      pluginRoot: "/plugin",
      execFile: exec,
    });
    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].url).toBe("https://example.com/about");
    expect(result.failures[0].detail).toMatch(/section count/);
  });
});
```

Run, expect fail.

- [ ] **Step 2: Implement**

Create `lib/qualify-extraction-runner.ts`:
```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const execFileP = promisify(execFile);

export interface QualifyPage {
  url: string;
  specDir: string;
}

export interface RunQualifyExtractionArgs {
  pages: QualifyPage[];
  adapterPath: string;
  pluginRoot?: string;
  execFile?: (cmd: string, args: string[], opts?: object) => Promise<{ stdout: string; stderr: string }>;
}

export interface QualifyResult {
  passed: boolean;
  failures: { url: string; detail: string }[];
}

export async function runQualifyExtraction(args: RunQualifyExtractionArgs): Promise<QualifyResult> {
  const root = args.pluginRoot ?? defaultPluginRoot();
  const script = resolve(root, "scripts/qualify-extraction.ts");
  const exec = args.execFile ?? execFileP;
  const failures: QualifyResult["failures"] = [];
  for (const page of args.pages) {
    try {
      await exec("npx", ["tsx", script, page.url, page.specDir, "--adapter", args.adapterPath], { env: process.env });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; message?: string };
      failures.push({
        url: page.url,
        detail: (e.stdout || e.stderr || e.message || "qualify-extraction failed").slice(0, 500),
      });
    }
  }
  return { passed: failures.length === 0, failures };
}

function defaultPluginRoot(): string {
  return resolve(fileURLToPath(new URL("..", import.meta.url)));
}
```

- [ ] **Step 3: Run — expect PASS (2)**

- [ ] **Step 4: Commit**

```bash
git add lib/qualify-extraction-runner.ts test/qualify-extraction-runner.test.ts
git commit -m "feat(plugin): add qualify-extraction wrapper"
```

---

## Task 12: Extract orchestrator — failing test

**Files:**
- Create: `test/extract.test.ts`

- [ ] **Step 1: Failing test**

Create `test/extract.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runExtract } from "../lib/extract.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";

const baseSite = (sourceUrl: string) => ({
  sourceUrl, target: "./",
  mode: "unattended" as const, goal: "wireframe" as const, inputMode: "url-only" as const,
  maxParallelPages: 4, maxParallelSections: 4,
});

function writePhase1(targetDir: string, runDir: string, urls: string[]) {
  const phaseDir = join(targetDir, ".migration/runs", runDir, "phase-1-discover");
  const discoveryDir = join(phaseDir, "discovery");
  mkdirSync(discoveryDir, { recursive: true });
  writeFileSync(join(discoveryDir, "crawl.json"), JSON.stringify({
    sourceUrl: urls[0],
    crawledAt: new Date().toISOString(),
    limits: { maxPages: 10, maxDepth: 2 },
    sitemapUrls: [],
    pages: urls.map((u, i) => ({
      url: u, slug: i === 0 ? "home" : `p${i}`, title: u, depth: i === 0 ? 0 : 1,
      discoveredVia: i === 0 ? "seed" : "link", status: 200, outboundLinks: [],
    })),
    errors: [],
  }, null, 2));
  writeFileSync(join(discoveryDir, "probe.json"), JSON.stringify({
    probedAt: new Date().toISOString(),
    pages: urls.map(u => ({
      url: u,
      matchedAdapters: ["/fake/adapter.json"],
      recommendation: "DIRECT_EXTRACTION",
      detectedCMP: null,
      isSPA: false,
    })),
  }, null, 2));
  writeFileSync(join(phaseDir, "VERIFICATION.md"), "# verified");
}

function writePhase2Library(targetDir: string, urls: string[]) {
  const lib = join(targetDir, ".migration/library");
  mkdirSync(lib, { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(join(lib, "layouts.json"), JSON.stringify({
    header: null, footer: null, nav: null, updatedAt: now,
  }, null, 2));
  writeFileSync(join(lib, "components.json"), JSON.stringify({
    components: [{
      id: "cluster-x", name: "X", signature: "x",
      tagSkeleton: "section",
      memberSections: [{ id: "p0-s0", url: urls[0] }],
      unique: false, propsRef: null,
    }],
    updatedAt: now,
  }, null, 2));
  writeFileSync(join(lib, "props.json"), JSON.stringify({ interfaces: [], updatedAt: now }, null, 2));
  writeFileSync(join(lib, "routes.json"), JSON.stringify({
    routes: urls.map(u => ({
      sourceUrl: u, nextRoute: new URL(u).pathname || "/", params: {}, kind: "static" as const,
    })),
    updatedAt: now,
  }, null, 2));
  const phase2Dir = join(targetDir, ".migration/runs/001-initial/phase-2-analyze");
  mkdirSync(phase2Dir, { recursive: true });
  writeFileSync(join(phase2Dir, "VERIFICATION.md"), "# verified");
}

function writePhase3Roadmap(targetDir: string) {
  const phase3Dir = join(targetDir, ".migration/runs/001-initial/phase-3-plan");
  mkdirSync(phase3Dir, { recursive: true });
  writeFileSync(join(phase3Dir, "VERIFICATION.md"), "# verified");
  writeFileSync(join(targetDir, ".migration/runs/001-initial/ROADMAP.md"), "---\ngoal: wireframe\n---\n# Roadmap\n");
}

const stubExtract = async ({ url, slug, pagesDir }: { url: string; slug: string; pagesDir: string }) => {
  const specDir = join(pagesDir, slug, "spec");
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, "styles.json"), JSON.stringify({ sections: [{ tagSkeleton: "section" }] }));
  writeFileSync(join(specDir, "structure.json"), JSON.stringify({ tree: [] }));
  writeFileSync(join(specDir, "00-globals.json"), JSON.stringify({ body: {} }));
  writeFileSync(join(specDir, "images.json"), JSON.stringify({ totalImages: 0, sections: [] }));
  writeFileSync(join(specDir, "animations.json"), JSON.stringify({ sections: [] }));
  return {
    url, slug,
    extractedAt: new Date().toISOString(),
    viewport: { width: 1440, height: 900 },
    files: { styles: "spec/styles.json", images: "spec/images.json", animations: "spec/animations.json", structure: "spec/structure.json", globals: "spec/00-globals.json" },
    stats: { sectionCount: 1, imageCount: 0, animationCount: 0 },
    errors: [],
  };
};

describe("runExtract", () => {
  it("extracts every page in routes.json, writes manifest + component-usage, emits VERIFICATION.md when all gates pass", async () => {
    const root = mkdtempSync(join(tmpdir(), "extract-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    const urls = ["https://example.com/", "https://example.com/about"];
    writePhase1(root, "001-initial", urls);
    writePhase2Library(root, urls);
    writePhase3Roadmap(root);

    await runExtract({
      targetDir: root,
      runDir: "001-initial",
      extractOne: stubExtract,
      validateExtraction: async () => ({ passed: true }),
      qualifyExtraction: async () => ({ passed: true, failures: [] }),
    });

    const phaseDir = join(root, ".migration/runs/001-initial/phase-4-extract");
    expect(existsSync(join(phaseDir, "PLAN.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "EXECUTION.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "extraction/manifest.json"))).toBe(true);

    expect(existsSync(join(root, ".migration/pages/home/spec/styles.json"))).toBe(true);
    expect(existsSync(join(root, ".migration/pages/home/component-usage.json"))).toBe(true);
    expect(existsSync(join(root, ".migration/pages/p1/spec/styles.json"))).toBe(true);
  });

  it("does NOT emit VERIFICATION.md when validate-extraction fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "extract-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    const urls = ["https://example.com/", "https://example.com/about"];
    writePhase1(root, "001-initial", urls);
    writePhase2Library(root, urls);
    writePhase3Roadmap(root);

    await runExtract({
      targetDir: root,
      runDir: "001-initial",
      extractOne: stubExtract,
      validateExtraction: async () => ({ passed: false, detail: "duplicate spec hash" }),
      qualifyExtraction: async () => ({ passed: true, failures: [] }),
    });

    const phaseDir = join(root, ".migration/runs/001-initial/phase-4-extract");
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(false);
    const v = JSON.parse(readFileSync(join(phaseDir, "verification.json"), "utf8"));
    expect(v.passed).toBe(false);
    expect(v.criteria.find((c: { name: string }) => c.name.includes("validate-extraction")).passed).toBe(false);
  });

  it("does NOT emit VERIFICATION.md when qualify-extraction fails for any page", async () => {
    const root = mkdtempSync(join(tmpdir(), "extract-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    const urls = ["https://example.com/", "https://example.com/about"];
    writePhase1(root, "001-initial", urls);
    writePhase2Library(root, urls);
    writePhase3Roadmap(root);

    await runExtract({
      targetDir: root,
      runDir: "001-initial",
      extractOne: stubExtract,
      validateExtraction: async () => ({ passed: true }),
      qualifyExtraction: async () => ({
        passed: false,
        failures: [{ url: "https://example.com/about", detail: "section count mismatch" }],
      }),
    });

    const phaseDir = join(root, ".migration/runs/001-initial/phase-4-extract");
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(false);
    const v = JSON.parse(readFileSync(join(phaseDir, "verification.json"), "utf8"));
    expect(v.criteria.find((c: { name: string }) => c.name.includes("qualify-extraction")).passed).toBe(false);
  });

  it("respects maxParallelPages by capping in-flight extractions", async () => {
    const root = mkdtempSync(join(tmpdir(), "extract-"));
    await bootstrapMigration({ targetDir: root, site: { ...baseSite("https://example.com/"), maxParallelPages: 2 } });
    const urls = Array.from({ length: 6 }, (_, i) => `https://example.com/p${i}`);
    writePhase1(root, "001-initial", urls);
    writePhase2Library(root, urls);
    writePhase3Roadmap(root);

    let inflight = 0;
    let peakInflight = 0;
    const slowStub: typeof stubExtract = async (args) => {
      inflight++;
      peakInflight = Math.max(peakInflight, inflight);
      await new Promise(r => setTimeout(r, 20));
      const m = await stubExtract(args);
      inflight--;
      return m;
    };

    await runExtract({
      targetDir: root,
      runDir: "001-initial",
      extractOne: slowStub,
      validateExtraction: async () => ({ passed: true }),
      qualifyExtraction: async () => ({ passed: true, failures: [] }),
    });
    expect(peakInflight).toBeLessThanOrEqual(2);
    expect(peakInflight).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run — expect fail (module not found)**

---

## Task 13: Extract orchestrator — implementation

**Files:**
- Create: `lib/extract.ts`

- [ ] **Step 1: Implement**

Create `lib/extract.ts`:
```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractPage, type ExtractStep } from "./extract-runner.ts";
import { runValidateExtraction, type RunResult } from "./validate-extraction-runner.ts";
import { runQualifyExtraction, type QualifyResult } from "./qualify-extraction-runner.ts";
import { buildComponentUsage } from "./component-usage.ts";
import { loadSite } from "./load-site.ts";
import { loadCrawl } from "./load-crawl.ts";
import { loadProbe } from "./load-probe.ts";
import { loadComponents } from "./load-components.ts";
import { loadRoutes } from "./load-routes.ts";
import { writePlan, writeExecution, writeVerification } from "./phase-state.ts";
import type { PageSpecManifest } from "../schemas/page-spec.ts";

export interface RunExtractArgs {
  targetDir: string;
  runDir: string;
  pluginRoot?: string;
  extractOne?: (args: {
    url: string;
    slug: string;
    pagesDir: string;
    adapterPath: string;
  }) => Promise<PageSpecManifest>;
  validateExtraction?: (args: { specDirs: string[] }) => Promise<RunResult>;
  qualifyExtraction?: (args: {
    pages: { url: string; specDir: string }[];
    adapterPath: string;
  }) => Promise<QualifyResult>;
}

export async function runExtract(args: RunExtractArgs): Promise<void> {
  const phaseDir = join(args.targetDir, ".migration/runs", args.runDir, "phase-4-extract");
  const extractionDir = join(phaseDir, "extraction");
  mkdirSync(extractionDir, { recursive: true });

  await writePlan(
    phaseDir,
    `# Phase 4 — Extract\n\nExtract per-page styles, images, animations into pages/[slug]/spec/.\n`,
  );

  const fail = (criteria: { name: string; passed: boolean; detail?: string }[]) =>
    writeVerification(phaseDir, {
      phase: "phase-4-extract",
      passed: false,
      checkedAt: new Date().toISOString(),
      criteria,
    });

  // Load preconditions
  const siteResult = loadSite(join(args.targetDir, ".migration/SITE.md"));
  if (!siteResult.valid) { await fail([{ name: "SITE.md valid", passed: false }]); return; }

  const crawlPath = join(args.targetDir, ".migration/runs", args.runDir, "phase-1-discover/discovery/crawl.json");
  const crawlResult = loadCrawl(crawlPath);
  if (!crawlResult.valid) { await fail([{ name: "crawl.json valid", passed: false }]); return; }

  const probePath = join(args.targetDir, ".migration/runs", args.runDir, "phase-1-discover/discovery/probe.json");
  const probeResult = loadProbe(probePath);
  if (!probeResult.valid) { await fail([{ name: "probe.json valid", passed: false }]); return; }

  const libDir = join(args.targetDir, ".migration/library");
  const componentsResult = loadComponents(join(libDir, "components.json"));
  if (!componentsResult.valid) { await fail([{ name: "components.json valid", passed: false }]); return; }
  const routesResult = loadRoutes(join(libDir, "routes.json"));
  if (!routesResult.valid) { await fail([{ name: "routes.json valid", passed: false }]); return; }

  // Build per-URL adapter map from probe
  const adapterByUrl = new Map<string, string>();
  for (const p of probeResult.data.pages) {
    if (p.matchedAdapters[0]) adapterByUrl.set(p.url, p.matchedAdapters[0]);
  }

  // Build per-URL slug map from crawl
  const slugByUrl = new Map<string, string>();
  for (const p of crawlResult.data.pages) slugByUrl.set(p.url, p.slug);

  const pagesDir = join(args.targetDir, ".migration/pages");
  mkdirSync(pagesDir, { recursive: true });

  const extractOne = args.extractOne ?? (a => extractPage(a));
  const maxParallel = siteResult.site.maxParallelPages;
  const manifests: PageSpecManifest[] = [];
  const extractFailures: { url: string; detail: string }[] = [];

  // Bounded-concurrency loop
  const queue = [...routesResult.data.routes];
  async function worker() {
    while (queue.length > 0) {
      const route = queue.shift();
      if (!route) return;
      const slug = slugByUrl.get(route.sourceUrl);
      const adapterPath = adapterByUrl.get(route.sourceUrl);
      if (!slug || !adapterPath) {
        extractFailures.push({ url: route.sourceUrl, detail: "missing slug or adapter mapping" });
        continue;
      }
      try {
        const manifest = await extractOne({ url: route.sourceUrl, slug, pagesDir, adapterPath });
        manifests.push(manifest);
        // Build component-usage from extracted structure
        const stylesPath = join(pagesDir, slug, "spec/styles.json");
        if (existsSync(stylesPath)) {
          const styles = JSON.parse(readFileSync(stylesPath, "utf8"));
          const sections = Array.isArray(styles?.sections)
            ? styles.sections.map((s: { tagSkeleton?: string }, i: number) => ({
                index: i,
                tagSkeleton: s.tagSkeleton ?? "",
              }))
            : [];
          const usage = buildComponentUsage({
            url: route.sourceUrl,
            slug,
            sections,
            registry: componentsResult.data,
          });
          writeFileSync(
            join(pagesDir, slug, "component-usage.json"),
            JSON.stringify(usage, null, 2),
          );
        }
      } catch (err) {
        extractFailures.push({ url: route.sourceUrl, detail: (err as Error).message });
      }
    }
  }
  const workerCount = Math.min(maxParallel, queue.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  writeFileSync(join(extractionDir, "manifest.json"), JSON.stringify(manifests, null, 2));
  if (extractFailures.length > 0) {
    writeFileSync(join(extractionDir, "failures.json"), JSON.stringify(extractFailures, null, 2));
  }
  await writeExecution(phaseDir, `Extracted ${manifests.length} pages, ${extractFailures.length} failures.`);

  // Validate
  const specDirs = manifests.map(m => join(pagesDir, m.slug, "spec"));
  const validateImpl = args.validateExtraction ?? ((a: { specDirs: string[] }) => runValidateExtraction({ specDirs: a.specDirs, pluginRoot: args.pluginRoot }));
  const validate = await validateImpl({ specDirs });

  // Qualify (uses any adapter — first one available)
  const firstAdapter = [...adapterByUrl.values()][0] ?? "";
  const qualifyImpl = args.qualifyExtraction ?? ((a: { pages: { url: string; specDir: string }[]; adapterPath: string }) =>
    runQualifyExtraction({ pages: a.pages, adapterPath: a.adapterPath, pluginRoot: args.pluginRoot }));
  const qualify = await qualifyImpl({
    pages: manifests.map(m => ({ url: m.url, specDir: join(pagesDir, m.slug, "spec") })),
    adapterPath: firstAdapter,
  });
  await writeExecution(phaseDir, `validate-extraction: ${validate.passed ? "PASS" : "FAIL"}; qualify-extraction: ${qualify.passed ? "PASS" : `FAIL (${qualify.failures.length} pages)`}.`);

  // Gate
  const everyPageExtracted = manifests.length === routesResult.data.routes.length && extractFailures.length === 0;
  const everyUsageReferencesKnownComponent = manifests.every(m => {
    const usagePath = join(pagesDir, m.slug, "component-usage.json");
    if (!existsSync(usagePath)) return false;
    const usage = JSON.parse(readFileSync(usagePath, "utf8"));
    const knownIds = new Set(componentsResult.data.components.map(c => c.id));
    return usage.components.every((c: { id: string }) => knownIds.has(c.id));
  });

  await writeVerification(phaseDir, {
    phase: "phase-4-extract",
    passed: everyPageExtracted && validate.passed && qualify.passed && everyUsageReferencesKnownComponent,
    checkedAt: new Date().toISOString(),
    criteria: [
      {
        name: "every page in routes.json was extracted",
        passed: everyPageExtracted,
        detail: extractFailures.length > 0 ? `${extractFailures.length} extraction failures` : undefined,
      },
      {
        name: "validate-extraction.ts passed (no duplicate spec hashes)",
        passed: validate.passed,
        detail: validate.detail,
      },
      {
        name: "qualify-extraction.ts passed for every page",
        passed: qualify.passed,
        detail: qualify.failures.length > 0 ? `${qualify.failures.length} pages failed: ${qualify.failures.map(f => f.url).join(", ")}` : undefined,
      },
      {
        name: "every component-usage.json references known components",
        passed: everyUsageReferencesKnownComponent,
      },
    ],
  });
}

export type { ExtractStep };
```

- [ ] **Step 2: Run extract test — expect PASS (4)**

```bash
pnpm test test/extract.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add lib/extract.ts test/extract.test.ts
git commit -m "feat(plugin): add Phase 4 extract orchestrator"
```

---

## Task 14: CLI shim for extract

**Files:**
- Modify: `lib/extract.ts` (append CLI shim)

- [ ] **Step 1: Append CLI shim**

Append at the bottom of `lib/extract.ts`:
```typescript
if (import.meta.url === `file://${process.argv[1]}`) {
  const get = (flag: string) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const targetDir = get("--target") ?? process.cwd();
  const runDir = get("--run") ?? "001-initial";
  runExtract({ targetDir, runDir })
    .then(() => { console.log(`Extract phase complete for run ${runDir}.`); })
    .catch(err => { console.error(err.message); process.exit(1); });
}
```

- [ ] **Step 2: Re-run extract tests to confirm shim does not break imports**

```bash
pnpm test test/extract.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add lib/extract.ts
git commit -m "feat(plugin): add CLI shim for extract"
```

---

## Task 15: Wire phase-4-extract into continue + integration test

**Files:**
- Modify: `lib/continue.ts`
- Create: `test/continue-extract.integration.test.ts`

- [ ] **Step 1: Update `defaultDispatchers()` in `lib/continue.ts`**

Add at the top with other lib imports:
```typescript
import { runExtract } from "./extract.ts";
```

In `defaultDispatchers()`, add a new entry after `phase-3-plan`:
```typescript
"phase-4-extract": async ({ targetDir, runDir }) => {
  await runExtract({ targetDir, runDir });
},
```

- [ ] **Step 2: Integration test**

Create `test/continue-extract.integration.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resumeMigration } from "../lib/continue.ts";
import { runExtract } from "../lib/extract.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";

const baseSite = (sourceUrl: string) => ({
  sourceUrl, target: "./",
  mode: "unattended" as const, goal: "wireframe" as const, inputMode: "url-only" as const,
  maxParallelPages: 4, maxParallelSections: 4,
});

function writePhases1to3(targetDir: string, urls: string[]) {
  const runDir = join(targetDir, ".migration/runs/001-initial");

  // Phase 1
  const p1 = join(runDir, "phase-1-discover");
  mkdirSync(join(p1, "discovery"), { recursive: true });
  writeFileSync(join(p1, "discovery/crawl.json"), JSON.stringify({
    sourceUrl: urls[0],
    crawledAt: new Date().toISOString(),
    limits: { maxPages: 10, maxDepth: 2 },
    sitemapUrls: [],
    pages: urls.map((u, i) => ({
      url: u, slug: i === 0 ? "home" : `p${i}`, title: u, depth: i === 0 ? 0 : 1,
      discoveredVia: i === 0 ? "seed" : "link", status: 200, outboundLinks: [],
    })),
    errors: [],
  }, null, 2));
  writeFileSync(join(p1, "discovery/probe.json"), JSON.stringify({
    probedAt: new Date().toISOString(),
    pages: urls.map(u => ({
      url: u, matchedAdapters: ["/fake/adapter.json"],
      recommendation: "DIRECT_EXTRACTION", detectedCMP: null, isSPA: false,
    })),
  }, null, 2));
  writeFileSync(join(p1, "VERIFICATION.md"), "# verified");

  // Phase 2
  const lib = join(targetDir, ".migration/library");
  mkdirSync(lib, { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(join(lib, "layouts.json"), JSON.stringify({
    header: null, footer: null, nav: null, updatedAt: now,
  }, null, 2));
  writeFileSync(join(lib, "components.json"), JSON.stringify({
    components: [{
      id: "cluster-x", name: "X", signature: "x",
      tagSkeleton: "section",
      memberSections: [{ id: "p0-s0", url: urls[0] }],
      unique: false, propsRef: null,
    }],
    updatedAt: now,
  }, null, 2));
  writeFileSync(join(lib, "props.json"), JSON.stringify({ interfaces: [], updatedAt: now }, null, 2));
  writeFileSync(join(lib, "routes.json"), JSON.stringify({
    routes: urls.map(u => ({
      sourceUrl: u, nextRoute: new URL(u).pathname || "/", params: {}, kind: "static" as const,
    })),
    updatedAt: now,
  }, null, 2));
  const p2 = join(runDir, "phase-2-analyze");
  mkdirSync(p2, { recursive: true });
  writeFileSync(join(p2, "VERIFICATION.md"), "# verified");

  // Phase 3
  const p3 = join(runDir, "phase-3-plan");
  mkdirSync(p3, { recursive: true });
  writeFileSync(join(p3, "VERIFICATION.md"), "# verified");
  writeFileSync(join(runDir, "ROADMAP.md"), "---\ngoal: wireframe\n---\n# Roadmap\n");
}

const stubExtract = async ({ url, slug, pagesDir }: { url: string; slug: string; pagesDir: string }) => {
  const specDir = join(pagesDir, slug, "spec");
  mkdirSync(specDir, { recursive: true });
  writeFileSync(join(specDir, "styles.json"), JSON.stringify({ sections: [{ tagSkeleton: "section" }] }));
  writeFileSync(join(specDir, "structure.json"), JSON.stringify({ tree: [] }));
  writeFileSync(join(specDir, "00-globals.json"), JSON.stringify({ body: {} }));
  writeFileSync(join(specDir, "images.json"), JSON.stringify({ totalImages: 0, sections: [] }));
  writeFileSync(join(specDir, "animations.json"), JSON.stringify({ sections: [] }));
  return {
    url, slug,
    extractedAt: new Date().toISOString(),
    viewport: { width: 1440, height: 900 },
    files: { styles: "spec/styles.json", images: "spec/images.json", animations: "spec/animations.json", structure: "spec/structure.json", globals: "spec/00-globals.json" },
    stats: { sectionCount: 1, imageCount: 0, animationCount: 0 },
    errors: [],
  };
};

describe("continue → extract end-to-end", () => {
  it("dispatches phase-4-extract when phase-3 has verified", async () => {
    const root = mkdtempSync(join(tmpdir(), "e2e-extract-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    writePhases1to3(root, ["https://example.com/", "https://example.com/about"]);

    const dispatchers = {
      "phase-4-extract": async ({ targetDir, runDir }: { targetDir: string; runDir: string }) => {
        await runExtract({
          targetDir, runDir,
          extractOne: stubExtract,
          validateExtraction: async () => ({ passed: true }),
          qualifyExtraction: async () => ({ passed: true, failures: [] }),
        });
      },
    };
    const result = await resumeMigration(root, { dispatchers });
    expect(result.kind).toBe("dispatched");
    if (result.kind === "dispatched") expect(result.phase).toBe("phase-4-extract");
    expect(existsSync(join(root, ".migration/pages/home/spec/styles.json"))).toBe(true);
    expect(existsSync(join(root, ".migration/runs/001-initial/phase-4-extract/VERIFICATION.md"))).toBe(true);
  });
});
```

- [ ] **Step 3: Run** `pnpm test test/continue-extract.integration.test.ts`. Expect PASS (1).

- [ ] **Step 4: Run full suite + typecheck**

```bash
pnpm test
pnpm typecheck
```

Expected: full suite green; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add lib/continue.ts test/continue-extract.integration.test.ts
git commit -m "feat(plugin): wire phase-4-extract into continue dispatcher"
```

---

## Task 16: page-extractor agent prompt

**Files:**
- Create: `agents/page-extractor.md`

- [ ] **Step 1: Write the agent prompt**

Create `agents/page-extractor.md`:
```markdown
---
name: page-extractor
description: Phase 4 sub-agent. Extracts per-page styles, images, and animations into `.migration/pages/[slug]/spec/` by invoking the vendored extract-styles / extract-images / extract-animations scripts. Operates on one URL at a time. Dispatched in parallel by the /migrate:extract skill, capped at maxParallelPages.
---

# Page Extractor Agent

You extract a single page's full visual spec by invoking three vendored scripts.

## Inputs

- `url` — source URL to extract
- `slug` — directory slug under `.migration/pages/`
- `targetDir` — user project root (parent of `.migration/`)
- `adapterPath` — absolute path to the matched adapter JSON (from `phase-1-discover/discovery/probe.json`)
- `pluginRoot` — plugin install dir (for resolving `scripts/*`)

## What you do

Invoke the runner once per page; the runner sequences the three scripts internally:

​```bash
tsx ${PLUGIN_DIR}/lib/extract.ts \
  --target "${TARGET_DIR}" \
  --run "${RUN_DIR}"
​```

The orchestrator handles fan-out per `maxParallelPages`. For most v1 runs you do not invoke me directly — the lib orchestrator does the work. Dispatching me as an agent is reserved for sites where extraction is flaky and per-page failures need LLM-side triage.

## Per-page error handling

Each script can fail independently. The runner records `step` + `message` in the manifest's `errors` array but does NOT stop on individual step failures. Your job is:

1. Read `pages/[slug]/manifest.json` after the runner returns.
2. If `errors[]` is non-empty, decide per error:
   - **Network timeout** — retry once with a longer wait, then give up.
   - **Selector returned 0 sections** — adapter `sectionDiscovery` is wrong for this page; surface to user, do NOT mutate the adapter.
   - **CDN 403 on image fetch** — known Webflow/Wix quirk (lessons.md #10). Skip the image, keep the URL in `images.json` for Phase 5 to handle via screenshot fallback.
   - **`__name is not defined` / similar tsx/esbuild error** — known shim issue (lessons.md #28). Surface to user as a plugin bug.
3. Never modify the vendored scripts themselves. Per spec § 14 they are vendored verbatim.

## Cost bound

You see only the manifest + error messages. Do NOT request full extracted spec files (they may be hundreds of KB to several MB per page).

## You MUST NOT

- Modify `scripts/*` or `scripts/lib/*` (vendored verbatim).
- Skip a page silently — every failure must end up in `manifest.errors[]` or `extraction/failures.json`.
- Touch the library JSONs (read-only at Phase 4).
- Invoke any other phase.
```

Replace zero-width `​```bash` fences with plain ASCII `​```bash`.

- [ ] **Step 2: Commit**

```bash
git add agents/page-extractor.md
git commit -m "feat(plugin): add page-extractor agent prompt"
```

---

## Task 17: /migrate:extract command + skill

**Files:**
- Create: `commands/migrate-extract.md`
- Create: `skills/migrate-extract/SKILL.md`

- [ ] **Step 1: Command**

Create `commands/migrate-extract.md`:
```markdown
---
name: migrate:extract
description: Explicitly run Phase 4 (Extract) for the active run.
---

Invoke the `migrate-extract` skill.
```

- [ ] **Step 2: Skill**

Create `skills/migrate-extract/SKILL.md`:
```markdown
---
name: migrate-extract
description: Run Phase 4 (Extract) — invoke per-page extract scripts, populate pages/[slug]/spec/, gate on validate-extraction + qualify-extraction.
---

# /migrate:extract

You are running Phase 4 explicitly. Phase 4 is data extraction — no codegen. Output is `.migration/pages/[slug]/spec/` populated with styles, images, animations, structure for every URL in `library/routes.json`.

## Step 1 — Verify preconditions

Read `.migration/SITE.md`. If it does not exist, abort: "No migration in this directory. Run `/migrate:new <url>`."

Read `.migration/runs/<runDir>/phase-3-plan/VERIFICATION.md`. If missing, abort: "Phase 3 must complete first. Run `/migrate:plan` or `/migrate:continue`."

If `runs/<runDir>/phase-4-extract/VERIFICATION.md` already exists, ask: "Phase 4 already verified. Re-run? (yes / no)" — abort on no.

## Step 2 — Run the extractor

​```bash
tsx ${PLUGIN_DIR}/lib/extract.ts \
  --target "${TARGET_DIR}" \
  --run "${RUN_DIR}"
​```

This:
- Reads `library/routes.json` for the page list
- Reads `discovery/probe.json` for per-URL adapter
- Reads `discovery/crawl.json` for per-URL slug
- For each page, invokes `scripts/extract-styles.ts` + `scripts/extract-images.ts` + `scripts/extract-animations.ts`, capped at `maxParallelPages`
- Writes `pages/[slug]/spec/{styles,images,animations,structure,00-globals}.json` per page
- Writes `pages/[slug]/manifest.json` per page with stats + errors
- Writes `pages/[slug]/component-usage.json` matching extracted sections to library cluster ids
- Runs `scripts/validate-extraction.ts` and `scripts/qualify-extraction.ts` as gates
- Writes `phase-4-extract/extraction/manifest.json` + `failures.json` + `verification.json` + (on pass) `VERIFICATION.md`

Wall-clock: ~3-8 seconds per page, parallelized at `maxParallelPages` (default 4). For a 47-page site at default cap, expect ~1-2 minutes.

## Step 3 — Triage failures

If `verification.json.passed === false`, read `extraction/failures.json` and `pages/[slug]/manifest.json` per page to see which step failed. Common patterns are catalogued in `knowledge/phase-pitfalls/extract.md`. In `attended` mode, surface failures to the user before re-running. In `unattended` mode, log + continue but do NOT auto-confirm.

## Step 4 — Optional LLM-side fan-out (large sites only)

For sites with >100 pages or known-flaky extraction (mixed SPA + static), dispatch `page-extractor` agent instances via `superpowers:dispatching-parallel-agents`. Each agent handles one page and surfaces step-level errors for retry decisions. v1 default does NOT use this — the lib orchestrator's bounded-concurrency loop is sufficient.

## Step 5 — Report

If `VERIFICATION.md` exists, print:

> Extract complete: N pages, M failures. Specs at `.migration/pages/`. Run `/migrate:status` or `/migrate:continue` to proceed to Phase 5 (Build — not yet implemented).

If the gate did not pass, surface failed criteria from `verification.json` and stop.

## You MUST NOT

- Modify `scripts/*` or `scripts/lib/*` — per spec § 14 vendored verbatim.
- Mutate `library/*.json` — Phase 4 is read-only on the library.
- Skip the gate — `validate-extraction` catches SPA-fallback duplicates (lessons.md #24); `qualify-extraction` catches structural drift.
- Invoke any other phase.
```

Replace zero-width `​```bash` fences with plain ASCII.

- [ ] **Step 3: Commit**

```bash
git add commands/migrate-extract.md skills/migrate-extract/SKILL.md
git commit -m "feat(plugin): add /migrate:extract skill and command"
```

---

## Task 18: Update `/migrate:continue` routing for phase-4

**Files:**
- Modify: `skills/migrate-continue/SKILL.md`

- [ ] **Step 1: Add the phase-4-extract row**

Read the current routing table. It already has rows for phase-1 / phase-2 / phase-3 / `phase-4-extract+` (the catch-all). Replace the catch-all row with a real `phase-4-extract` entry plus a `phase-5-build+` catch-all:

```markdown
| `phase-4-extract` | `tsx ${PLUGIN_DIR}/lib/continue.ts --target "${PWD}"` OR `/migrate:extract` skill | Per-page extraction is deterministic; the lib dispatcher's bounded-concurrency loop handles the parallel-by-page work. Invoke the `/migrate:extract` skill only when the site is large or extraction is known-flaky and per-page LLM-side triage is needed. Default: lib dispatcher. |
| `phase-5-build`+ | (Not yet implemented — Plan 6+.) | Print which phase is next and ask the user: "Run `/migrate:[next-phase]` manually." |
```

After the table, add a paragraph:
```markdown
For phase-4, the lib dispatcher is the default — extraction is deterministic and parallelism is handled by `lib/extract.ts`'s bounded-concurrency loop. The `/migrate:extract` skill exists for large or flaky sites where per-page LLM-side triage is worth the dispatch cost; in that case follow the skill end to end.
```

- [ ] **Step 2: Run `pnpm test`** to confirm markdown changes don't break anything.

- [ ] **Step 3: Commit**

```bash
git add skills/migrate-continue/SKILL.md
git commit -m "feat(plugin): route phase-4-extract in continue"
```

---

## Task 19: Knowledge — extract phase pitfalls

**Files:**
- Create: `knowledge/phase-pitfalls/extract.md`

- [ ] **Step 1: Write the pitfalls file**

Create `knowledge/phase-pitfalls/extract.md`:
```markdown
# Phase 4 (Extract) — pitfalls

## Vendored scripts policy

Per spec § 14 the three extract scripts (`extract-styles.ts`, `extract-images.ts`, `extract-animations.ts`) plus the two gate scripts (`validate-extraction.ts`, `qualify-extraction.ts`) are vendored verbatim from `nextjs-migration-agent`. **Do not modify them.** The wrapper layer in `lib/extract-runner.ts` adapts to their existing CLI conventions.

If a vendored script is buggy, fix it in the source repo first, then re-vendor. Patching in the plugin breaks the "plugin is the source of truth going forward" rule from spec § 3.

## CLI quirks the wrapper handles

- **`extract-images.ts` writes to `public/images/<domain>/<page>/` relative to CWD** (binaries) and `docs/specs/<page>/` (JSON). The wrapper invokes it with `cwd` set to a per-page `_staging` dir, then moves the JSON output into `pages/[slug]/spec/images.json`. Binaries stay in the staging dir for now; Phase 5 copies them into `<target>/public/`.
- **`extract-styles.ts` accepts viewports.** The wrapper passes `[1440]` by default. Pixel-perfect goal will need multi-viewport extraction in Phase 6 polish; v1 Phase 4 sticks to 1440px (matches `verify-build-baseline` viewport).
- **All three scripts accept `--adapter <path>`.** The wrapper resolves the adapter from `discovery/probe.json[].matchedAdapters[0]` per page. If a page has no matched adapter, that page is skipped (extraction failure logged in `failures.json`).

## Per-step error handling

The runner does NOT throw on individual step failures. Each step's outcome is recorded in `pages/[slug]/manifest.json.errors[]`. The orchestrator decides whether the gate passes based on cross-step state (e.g., styles must succeed; images can fail with degraded output; animations failure is non-fatal in `wireframe` goal).

- **Styles failure → page is unusable.** The orchestrator marks the page as failed in `extraction/failures.json` and the page-coverage gate criterion fails.
- **Images failure → degraded.** Phase 5 falls back to placeholder images; visual diff in Phase 6 will catch the gap.
- **Animations failure → non-fatal.** v1 wireframe ignores; pixel-perfect retries in Phase 7.

## Known failure patterns from lessons.md

- **`__name is not defined` in `page.evaluate()` callbacks** (lessons.md #28). Caused by tsx/esbuild's `keepNames` injecting a host-side helper that doesn't exist in the browser context. Fix is in the script (in-page shim); if a script lacks the shim, surface to user as a plugin bug.
- **Lazy-loaded images return 0 results** (lessons.md #3). Adapter must specify `images.lazyLoadStrategy`. The script scrolls + waits before extracting.
- **Webflow CDN 403 on background images** (lessons.md #10). Some `cdn.prod.website-files.com` URLs are blocked. The script keeps the URL in `images.json` but flags it; Phase 5 handles via Playwright screenshot fallback.
- **SPA fallback content extracted across pages** (lessons.md #24). All URLs return the same shell. `validate-extraction.ts` catches duplicate spec hashes — fails fast. Do NOT proceed to Phase 5.
- **Memory leaks from infinite GSAP timelines** (lessons.md #51). Browser contexts accumulate. The orchestrator should run a memory watchdog (32GB threshold on 48GB machine) and kill browser processes if exceeded. Currently NOT implemented in v1; track as a follow-up issue if a real run hits memory pressure.

## Concurrency

`maxParallelPages` defaults to 4 (set in `SITE.md`, configurable via `/migrate:config`). Higher values risk:

- Playwright context exhaustion (each context spawns a Chromium process)
- Memory leaks compounding (lessons.md #51)
- Source-site rate limiting (some CDNs throttle aggressive parallel fetches)

Lower values are safer but slow. Real-world tuning: 4 for sites <50 pages; drop to 2 for sites with heavy animations or large image counts.

## component-usage.json semantics

`pages/[slug]/component-usage.json` matches each extracted section to a Phase 2 cluster id by exact `tagSkeleton`. Sections that don't match any cluster end up in `unmatchedSectionIndices`. Common causes:

- **Phase 2 mega-cluster split is incomplete.** Some sections that look like Heroes were grouped under a generic `ContentSection` cluster and don't match the more specific `Hero` tagSkeleton from this page. Surface in plan-checker / Phase 5 UX.
- **Page-unique section.** A section appears on one page only and didn't cluster in Phase 2 (became a singleton). It IS in `components.json` with `unique: true`; the matcher should still find it.
- **Phase 2 ran with composite-shingles fix not applied.** Older runs may carry a few-cluster registry that doesn't capture the page's actual structure. Re-run `/migrate:analyze` to refresh.

## Atomic-commit discipline

Per spec § 4, each page extracted should be committable independently. The orchestrator writes per-page manifests as soon as they complete — `pages/[slug]/manifest.json` exists even if validate/qualify later fail. This means re-running `/migrate:extract` after a partial failure does NOT re-extract pages whose manifest already passed. v1 implementation does not include this skip-existing optimization; track as a follow-up.

## Gate tightness vs site reality

- **`validate-extraction.ts` is strict.** Duplicate hashes always fail. SPA sites with shared content across URLs (e.g., a docs site with the same chrome on every page) may trip this — adjust crawl scope or accept `qualify-extraction` warnings.
- **`qualify-extraction.ts` per-page.** Section count must match the crawl's recorded count. If Phase 1's `crawl.json` recorded a different count than what extraction yields, qualify fails — root cause is Phase 1 / Phase 2 disagreement on what counts as a section, not Phase 4.

## When extraction succeeds but the result is wrong

- Mega-clusters from Phase 2 propagate: many pages produce specs that all map to the same `ContentSection` cluster. Phase 5 will generate one component for many distinct visual patterns.
- Empty `library/layouts.json` slots mean Phase 5 builds pages without a header / footer / nav. Catch with `migration-planner` warnings in Phase 3.
- `component-usage.json` with high `unmatchedSectionIndices` count → Phase 2 cluster registry is too coarse. Re-run `/migrate:analyze` with stricter thresholds, OR ship to Phase 5 anyway and rely on visual diff in Phase 6 to catch.
```

- [ ] **Step 2: Commit**

```bash
git add knowledge/phase-pitfalls/extract.md
git commit -m "docs(plugin): add Phase 4 (Extract) pitfalls knowledge file"
```

---

## Task 20: Final verification — full test + typecheck

- [ ] **Step 1: Run the full test suite**

```bash
pnpm test
```

Expected: All Plan 1-4 tests still pass. New Plan 5 tests pass:
- `page-spec-schema.test.ts` — 5
- `load-page-spec.test.ts` — 2
- `component-usage-schema.test.ts` — 3
- `load-component-usage.test.ts` — 2
- `component-usage.test.ts` — 4
- `extract-runner.test.ts` — 2
- `validate-extraction-runner.test.ts` — 2
- `qualify-extraction-runner.test.ts` — 2
- `extract.test.ts` — 4
- `continue-extract.integration.test.ts` — 1

Total new: ~27. Combined: previous ~197 + 27 = ~224 passing.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: exits 0.

- [ ] **Step 3: Manual smoke test against the demo repo**

If a `.migration/` from a real Phase 1+2+3 run is available (e.g., `/Users/janlewandoski/Projects/Blazity/blazity-page-nextjs-migration`), point the extract CLI at it:

```bash
tsx ~/.../nextjs-migration-plugin/lib/extract.ts \
  --target "/path/to/user-project" \
  --run "001-initial"
```

Expected: 47 page directories under `.migration/pages/`, each with `spec/{styles,images,animations,structure,00-globals}.json` + `manifest.json` + `component-usage.json`. Phase dir has `extraction/manifest.json` aggregating per-page stats. Wall-clock: 1-3 minutes.

If extraction fails for many pages, common causes are catalogued in `knowledge/phase-pitfalls/extract.md`. Address case-by-case; do NOT modify the vendored scripts.

- [ ] **Step 4: Commit any smoke-driven fixes**

If the smoke surfaces wrapper issues (e.g., `extract-images.ts` cwd handling, adapter path resolution, slug mismatch between crawl and routes), fix them in the wrapper layer only. Commit with `fix(plugin): [specific issue]`.

---

## Self-review — spec coverage

| Spec requirement | Task(s) |
|---|---|
| § 5 row 4: page-extractor agent | 16 |
| § 5 row 4: `pages/[slug]/spec/` artifacts | 8-9 (runner), 12-13 (orchestrator) |
| § 5 row 4 gate: validate-extraction passes | 10, 13 |
| § 5 row 4 gate: qualify-extraction passes | 11, 13 |
| § 5 phase ordering: Phase 4 parallel-by-page, capped at maxParallelPages | 12-13 (bounded-concurrency loop in orchestrator) |
| § 9 `/migrate:extract` explicit invocation | 14 (CLI shim), 17 (skill+command) |
| § 10 page-extractor wraps extract-styles + extract-images + extract-animations | 8-9 (runner), 16 (agent) |
| § 12 parallelism knobs (`maxParallelPages`) | 12-13 (read from SITE.md, capped) |
| § 14 vendored scripts policy — no modification | 9 (CWD-staging trick avoids modifying extract-images), 16 (agent rule), 19 (knowledge file) |
| § 4 state model — `pages/[slug]/spec/`, `manifest.json`, `component-usage.json` | 1-2 (manifest schema), 4 (component-usage schema), 6-7 (matcher), 8-9 (runner), 12-13 (orchestrator) |
| § 7 state schemas via Zod + state-repairer | 1-5 (all new schemas use existing `LoadResult<T>` plumbing) |
| Wire phase-4-extract into `/migrate:continue` | 15 |
| Knowledge — phase-4 pitfalls | 19 |

**Deferred to later plans (per Out of scope):**
- Phase 5 (Build), Phase 6+ (Polish) — Plan 6+
- Delta-mode extraction via `/migrate:add-pages` — Plan 7+
- Multi-viewport extraction (Phase 6 polish) — Plan 7+
- Memory watchdog for parallel browser contexts (lessons.md #51 follow-up) — track as ISSUE in `knowledge/open-issues/` if a real run trips it
- Skip-existing optimization for partial re-runs — track as ISSUE if needed

**Type / name consistency check:**
- `LoadResult<T>.data` used uniformly by every loader. Matches Plan 2-4 convention.
- `PageSpecManifest` / `ComponentUsage` names used consistently in Tasks 1-7, 12-13, 15.
- `runExtract` / `extractPage` arg names (`targetDir`, `runDir`, `pagesDir`, `slug`, `url`, `adapterPath`) match across all tasks.
- `ExtractStep` callable signature (`{ url, outputDir, adapterPath, pluginRoot } => Promise<void>`) consistent in `extract-runner.ts` + tests.
- Phase-id strings (`phase-4-extract`) match across `lib/phase-status.ts` (already in `knownPhases` from Plan 2 Task 16), `lib/extract.ts`, `lib/continue.ts`, the integration test, the agent prompt, the skill, the knowledge file, and the spec.
- `RunResult` / `QualifyResult` shapes match between runner files and the orchestrator's stub injection types.

No TBD placeholders. Every code-modifying step shows the code.

## Ready for execution

Plan complete and saved to `docs/superpowers/plans/2026-05-01-phase-4-extract.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch with checkpoints

Which approach?
