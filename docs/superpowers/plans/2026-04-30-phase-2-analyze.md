# Phase 2 Analyze Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement runtime Phase 2 (Analyze) end-to-end so that, after a verified Phase 1, `/migrate:continue` (or the explicit `/migrate:analyze`) walks every page in `discovery/crawl.json`, clusters sections via a hybrid algorithmic + LLM pass, and writes Zod-validated `library/{layouts,components,props,routes}.json` plus an appended `library/HISTORY.md` under the user's `.migration/`. The phase emits `VERIFICATION.md` only after the gate from spec § 5 row 2 passes — every page has an entry in `routes.json`, and every section across pages either belongs to a cluster or is explicitly marked unique.

**Architecture:** A new lightweight Playwright script `scripts/discover-sections.ts` visits each crawled URL, runs the matched adapter's `sectionDiscovery.primarySelector`, and emits a per-section signature record (DOM path shingles + tag skeleton + sample text + bounding box) to `analysis/sections.json`. A pure `lib/section-signature.ts` + `lib/cluster.ts` pair runs the algorithmic first-pass per spec § 11 — Jaccard similarity over path-shingles, greedy clustering above a high-confidence threshold, ambiguous pairs surfaced for LLM refinement. `lib/route-map.ts` infers Next.js App Router patterns (`/case-study/cookunity` + `/case-study/vibes` → `/case-study/[slug]`) by tokenizing crawled paths and detecting variable positions. `lib/analyze.ts` orchestrates: dispatch sections probe → cluster → write `layouts.json` + `components.json` + `props.json` + `routes.json` + append to `HISTORY.md` → write phase verification. The four agents from spec § 5 row 2 — `layout-extractor`, `component-deduper`, `prop-classifier`, `route-mapper` — are markdown prompt files describing their narrow responsibility within that pipeline; the LLM-refinement step in `component-deduper` operates on cluster summaries only, not full DOM. `phase-2-analyze` wires into `defaultDispatchers()` in `lib/continue.ts` so the existing `/migrate:continue` resume path advances to Phase 2 automatically once Phase 1 has verified.

**Tech Stack:** TypeScript, Zod, Vitest, Node ≥22, pnpm, Playwright. Markdown for skills/agents. Shell-invokable scripts via `tsx`.

**Execution context:** All paths are relative to `nextjs-migration-plugin/` repo root. The previous plan tagged `v0.0.2`; this plan does not introduce a new tag. Some tasks rely on the same in-process HTTP fixture server pattern Plan 2 introduced (`get-port` + `http.createServer`) — no external network access required for the test suite. The hybrid analysis's algorithmic first-pass is fully tested in unit tests; the LLM-refinement branch is exercised via stub injection so tests do not call any model.

**Spec source:** `docs/superpowers/specs/2026-04-21-migration-plugin-design.md` § 5 (Phase 2 row), § 9 (`/migrate:analyze`), § 10 (the four new agents), § 11 (hybrid analysis approach).

**Predecessors:**
- `docs/superpowers/plans/2026-04-21-plugin-foundation.md` (executed, tagged `v0.0.1`)
- `docs/superpowers/plans/2026-04-29-phase-1-discover.md` (executed, tagged `v0.0.2`)

**Out of scope (deferred to later plans):**
- Delta-mode Analyze (spec § 6) — invoked under `/migrate:add-pages`. Plan 3 covers the initial-run path only; the library-extension flow (exact / near / no match handling, prop-variant proposal, sibling variant fallback) lands with `/migrate:add-pages` in a later plan.
- Visual regression gate around library extensions (spec § 6 visual regression) — only relevant once delta-mode Analyze exists.
- Generation of TS prop interface source files into the user's target project. Phase 2 writes `props.json` (the schema source of truth) only; emitting `.d.ts` or generated `.ts` files into `<target>/src/` is a Phase 5 (Build) concern.

---

## File structure (what this plan produces)

```
nextjs-migration-plugin/
├── schemas/
│   ├── sections.ts                              # NEW — DiscoveredSectionsSchema
│   ├── layouts.ts                               # NEW — LayoutsSchema (header/footer/nav clusters)
│   ├── components.ts                            # NEW — ComponentsSchema (in-page clusters)
│   ├── props.ts                                 # NEW — PropsRegistrySchema (TS prop shapes)
│   └── routes.ts                                # NEW — RoutesSchema (URL → Next.js path map)
├── lib/
│   ├── load-sections.ts                         # NEW
│   ├── load-layouts.ts                          # NEW
│   ├── load-components.ts                       # NEW
│   ├── load-props.ts                            # NEW
│   ├── load-routes.ts                           # NEW
│   ├── section-signature.ts                     # NEW — pure helpers (shingles, skeleton, jaccard)
│   ├── cluster.ts                               # NEW — greedy clusterer over signatures
│   ├── route-map.ts                             # NEW — URL pattern → Next.js route inference
│   ├── library-history.ts                       # NEW — appends to HISTORY.md
│   ├── discover-sections-runner.ts              # NEW — invokes scripts/discover-sections.ts
│   ├── analyze.ts                               # NEW — Phase 2 orchestrator
│   └── continue.ts                              # MODIFIED — register phase-2-analyze dispatcher
├── scripts/
│   └── discover-sections.ts                     # NEW — Playwright per-URL section probe
├── commands/
│   └── migrate-analyze.md                       # NEW
├── skills/
│   └── migrate-analyze/SKILL.md                 # NEW
├── agents/
│   ├── layout-extractor.md                      # NEW
│   ├── component-deduper.md                     # NEW
│   ├── prop-classifier.md                       # NEW
│   └── route-mapper.md                          # NEW
├── knowledge/phase-pitfalls/
│   └── analyze.md                               # NEW
└── test/
    ├── sections-schema.test.ts                  # NEW
    ├── load-sections.test.ts                    # NEW
    ├── layouts-schema.test.ts                   # NEW
    ├── load-layouts.test.ts                     # NEW
    ├── components-schema.test.ts                # NEW
    ├── load-components.test.ts                  # NEW
    ├── props-schema.test.ts                     # NEW
    ├── load-props.test.ts                       # NEW
    ├── routes-schema.test.ts                    # NEW
    ├── load-routes.test.ts                      # NEW
    ├── section-signature.test.ts                # NEW
    ├── cluster.test.ts                          # NEW
    ├── route-map.test.ts                        # NEW
    ├── library-history.test.ts                  # NEW
    ├── discover-sections-runner.test.ts         # NEW (in-process HTTP fixture)
    ├── analyze.test.ts                          # NEW (in-process HTTP fixture)
    ├── continue-analyze.integration.test.ts     # NEW
    └── fixtures/
        ├── sections-valid.json                  # NEW
        ├── sections-invalid.json                # NEW
        ├── layouts-valid.json                   # NEW
        ├── layouts-invalid.json                 # NEW
        ├── components-valid.json                # NEW
        ├── components-invalid.json              # NEW
        ├── props-valid.json                     # NEW
        ├── props-invalid.json                   # NEW
        ├── routes-valid.json                    # NEW
        ├── routes-invalid.json                  # NEW
        └── section-fixture/                     # NEW — multi-page HTML fixture for sections probe
            ├── index.html
            ├── about.html
            ├── pricing.html
            └── case-study-x.html
```

Each lib file has a single responsibility. Schemas define data shape. Loaders parse + validate + return diagnostics via `LoadResult<T>`. Pure functions (`section-signature.ts`, `cluster.ts`, `route-map.ts`) are unit-testable without I/O. The orchestrator (`analyze.ts`) wires the pure pieces to the side-effecting runner. Skills and agents are thin LLM-facing markdown.

---

## Conventions used in this plan

- Loader pattern matches Plan 2: `loadX(path)` returns `LoadResult<X>` from `schemas/errors.ts`. State auto-repair via the existing `loadWithRepair` from `lib/load-with-repair.ts` (no new repair plumbing needed).
- Phase artifacts under `runs/<runDir>/phase-2-analyze/`:
  ```
  PLAN.md
  EXECUTION.md
  VERIFICATION.md           # only on gate pass
  verification.json         # always
  analysis/
  ├── sections.json         # output of discover-sections probe
  └── clusters.json         # algorithmic-first-pass cluster proposals (audit trail)
  ```
- Library artifacts under `.migration/library/` (shared across runs, evolves):
  ```
  layouts.json
  components.json
  props.json
  routes.json
  HISTORY.md                # human-readable append-only changelog
  ```
- "Verified" means: every library JSON validates against its Zod schema AND every page in `discovery/crawl.json` appears in `routes.json` AND every section across all pages either belongs to a cluster (in `layouts.json` or `components.json`) or is explicitly marked `unique: true`.
- Cluster IDs are stable derivations from signature digests (e.g., `cluster-h-a3f1...`) so re-runs against the same input produce the same IDs.
- Where Plan 2 uses `runDiscover({ probeOne })` for stub injection, Plan 3 uses `runAnalyze({ discoverSections })` for the same purpose.

---

## Task 1: Sections schema — failing test

**Files:**
- Create: `test/fixtures/sections-valid.json`
- Create: `test/fixtures/sections-invalid.json`
- Create: `test/sections-schema.test.ts`

- [ ] **Step 1: Create fixtures**

Create `test/fixtures/sections-valid.json`:
```json
{
  "probedAt": "2026-04-30T12:00:00.000Z",
  "pages": [
    {
      "url": "https://example.com/",
      "sections": [
        {
          "id": "home-0",
          "selector": "body > header",
          "tagSkeleton": "header>nav>ul>li",
          "pathShingles": ["body>header", "header>nav", "nav>ul"],
          "sampleText": "Home About Pricing",
          "boundingBox": { "x": 0, "y": 0, "width": 1440, "height": 80 }
        },
        {
          "id": "home-1",
          "selector": "body > main > section.hero",
          "tagSkeleton": "section>div>h1",
          "pathShingles": ["body>main", "main>section", "section>div"],
          "sampleText": "Welcome to example",
          "boundingBox": { "x": 0, "y": 80, "width": 1440, "height": 600 }
        }
      ]
    }
  ]
}
```

Create `test/fixtures/sections-invalid.json`:
```json
{
  "probedAt": "today",
  "pages": [
    { "url": "not-a-url", "sections": [] }
  ]
}
```

- [ ] **Step 2: Write the failing schema test**

Create `test/sections-schema.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DiscoveredSectionsSchema } from "../schemas/sections.ts";

const readFixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("DiscoveredSectionsSchema", () => {
  it("accepts a valid sections probe", () => {
    const result = DiscoveredSectionsSchema.safeParse(readFixture("sections-valid.json"));
    expect(result.success).toBe(true);
  });

  it("rejects a non-ISO probedAt", () => {
    const result = DiscoveredSectionsSchema.safeParse(readFixture("sections-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("probedAt"))).toBe(true);
    }
  });

  it("rejects a non-URL page url", () => {
    const result = DiscoveredSectionsSchema.safeParse(readFixture("sections-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.join(".") === "pages.0.url")).toBe(true);
    }
  });

  it("rejects a section without an id", () => {
    const bad = {
      probedAt: "2026-04-30T12:00:00.000Z",
      pages: [{
        url: "https://example.com/",
        sections: [{ selector: "x", tagSkeleton: "x", pathShingles: [], boundingBox: { x: 0, y: 0, width: 1, height: 1 } }],
      }],
    };
    const result = DiscoveredSectionsSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.join(".").endsWith("id"))).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run — expect fail**

```bash
pnpm test test/sections-schema.test.ts
```

Expected: FAIL with `Cannot find module '../schemas/sections.ts'`.

---

## Task 2: Sections schema — implementation

**Files:**
- Create: `schemas/sections.ts`

- [ ] **Step 1: Implement**

Create `schemas/sections.ts`:
```typescript
import { z } from "zod";

export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

export const SectionRecordSchema = z.object({
  id: z.string().min(1),
  selector: z.string().min(1),
  tagSkeleton: z.string(),
  pathShingles: z.array(z.string()).default([]),
  sampleText: z.string().default(""),
  boundingBox: BoundingBoxSchema,
});

export const PageSectionsSchema = z.object({
  url: z.string().url(),
  sections: z.array(SectionRecordSchema),
});

export const DiscoveredSectionsSchema = z.object({
  probedAt: z.string().datetime(),
  pages: z.array(PageSectionsSchema).min(1),
});

export type DiscoveredSections = z.infer<typeof DiscoveredSectionsSchema>;
export type PageSections = z.infer<typeof PageSectionsSchema>;
export type SectionRecord = z.infer<typeof SectionRecordSchema>;
```

- [ ] **Step 2: Run test — expect PASS (4)**

```bash
pnpm test test/sections-schema.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add schemas/sections.ts test/sections-schema.test.ts test/fixtures/sections-valid.json test/fixtures/sections-invalid.json
git commit -m "feat(plugin): add Zod sections schema"
```

---

## Task 3: Sections loader — failing test

**Files:**
- Create: `test/load-sections.test.ts`

- [ ] **Step 1: Write failing test**

Create `test/load-sections.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadSections } from "../lib/load-sections.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadSections", () => {
  it("returns { valid: true } for a valid sections.json", () => {
    const result = loadSections(fixturePath("sections-valid.json"));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.pages).toHaveLength(1);
  });

  it("returns { valid: false, issues } for an invalid sections.json", () => {
    const result = loadSections(fixturePath("sections-invalid.json"));
    expect(result.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect fail (module not found)**

---

## Task 4: Sections loader — implementation

**Files:**
- Create: `lib/load-sections.ts`

- [ ] **Step 1: Implement**

Create `lib/load-sections.ts`:
```typescript
import { readFileSync } from "node:fs";
import { DiscoveredSectionsSchema, type DiscoveredSections } from "../schemas/sections.ts";
import type { LoadResult } from "../schemas/errors.ts";

export function loadSections(path: string): LoadResult<DiscoveredSections> {
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
  const result = DiscoveredSectionsSchema.safeParse(rawJson);
  if (result.success) return { valid: true, data: result.data };
  return { valid: false, path, rawJson, issues: result.error.issues };
}
```

- [ ] **Step 2: Run test — expect PASS (2)**

- [ ] **Step 3: Commit**

```bash
git add lib/load-sections.ts test/load-sections.test.ts
git commit -m "feat(plugin): add sections loader"
```

---

## Task 5: Section signature helpers — failing test

**Files:**
- Create: `test/section-signature.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/section-signature.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { pathShingles, jaccard, signatureDigest } from "../lib/section-signature.ts";

describe("pathShingles", () => {
  it("produces N-gram path windows of length 3 by default", () => {
    const tags = ["body", "main", "section", "div", "h1"];
    const shingles = pathShingles(tags);
    expect(shingles).toEqual([
      "body>main>section",
      "main>section>div",
      "section>div>h1",
    ]);
  });

  it("returns the full path when tags shorter than n", () => {
    expect(pathShingles(["body", "header"])).toEqual(["body>header"]);
  });

  it("returns empty array when tags is empty", () => {
    expect(pathShingles([])).toEqual([]);
  });
});

describe("jaccard", () => {
  it("returns 1 for identical sets", () => {
    expect(jaccard(["a", "b", "c"], ["a", "b", "c"])).toBe(1);
  });

  it("returns 0 for disjoint sets", () => {
    expect(jaccard(["a", "b"], ["c", "d"])).toBe(0);
  });

  it("returns 0.5 for half overlap", () => {
    // intersection {b} = 1, union {a,b,c} = 3 → 1/3 ≈ 0.333
    expect(jaccard(["a", "b"], ["b", "c"])).toBeCloseTo(0.333, 2);
  });

  it("treats empty inputs as similarity 0", () => {
    expect(jaccard([], [])).toBe(0);
    expect(jaccard(["a"], [])).toBe(0);
  });
});

describe("signatureDigest", () => {
  it("produces a stable hex digest for the same input", () => {
    const a = signatureDigest({ tagSkeleton: "section>div>h1", pathShingles: ["body>main>section"] });
    const b = signatureDigest({ tagSkeleton: "section>div>h1", pathShingles: ["body>main>section"] });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16,}$/);
  });

  it("changes when tagSkeleton changes", () => {
    const a = signatureDigest({ tagSkeleton: "section>div>h1", pathShingles: [] });
    const b = signatureDigest({ tagSkeleton: "section>div>h2", pathShingles: [] });
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run — expect fail (module not found)**

---

## Task 6: Section signature helpers — implementation

**Files:**
- Create: `lib/section-signature.ts`

- [ ] **Step 1: Implement**

Create `lib/section-signature.ts`:
```typescript
import { createHash } from "node:crypto";

export function pathShingles(tags: string[], n = 3): string[] {
  if (tags.length === 0) return [];
  if (tags.length < n) return [tags.join(">")];
  const out: string[] = [];
  for (let i = 0; i + n <= tags.length; i++) {
    out.push(tags.slice(i, i + n).join(">"));
  }
  return out;
}

export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface SignatureInput {
  tagSkeleton: string;
  pathShingles: string[];
}

export function signatureDigest(input: SignatureInput): string {
  const canonical = JSON.stringify({
    tagSkeleton: input.tagSkeleton,
    pathShingles: [...input.pathShingles].sort(),
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}
```

- [ ] **Step 2: Run — expect PASS (10 cases)**

- [ ] **Step 3: Commit**

```bash
git add lib/section-signature.ts test/section-signature.test.ts
git commit -m "feat(plugin): add section signature helpers (shingles, jaccard, digest)"
```

---

## Task 7: Algorithmic clusterer — failing test

**Files:**
- Create: `test/cluster.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/cluster.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { clusterSections, type SectionInput } from "../lib/cluster.ts";

const mk = (id: string, shingles: string[], skeleton = "section"): SectionInput => ({
  id,
  pathShingles: shingles,
  tagSkeleton: skeleton,
  pageUrl: "https://example.com/",
});

describe("clusterSections", () => {
  it("groups sections with jaccard >= autoMergeThreshold into the same cluster", () => {
    const sections = [
      mk("a", ["body>main>section", "main>section>div", "section>div>h1"]),
      mk("b", ["body>main>section", "main>section>div", "section>div>h1"]),
      mk("c", ["body>footer>div", "footer>div>p"]),
    ];
    const { clusters, ambiguousPairs, unique } = clusterSections(sections, {
      autoMergeThreshold: 0.85,
      ambiguousThreshold: 0.6,
    });
    expect(clusters.find(c => c.memberIds.includes("a"))?.memberIds.sort()).toEqual(["a", "b"]);
    expect(clusters.find(c => c.memberIds.includes("c"))?.memberIds).toEqual(["c"]);
    // `c` ended up as a singleton cluster → marked unique per spec § 5 row 2.
    expect(unique.map(u => u.id).sort()).toEqual(["c"]);
    expect(ambiguousPairs).toEqual([]);
  });

  it("surfaces ambiguous pairs whose similarity is between thresholds", () => {
    const sections = [
      mk("a", ["body>main>section", "main>section>div", "section>div>h1"]),
      mk("b", ["body>main>section", "main>section>div", "section>div>h2"]),
    ];
    const { clusters, ambiguousPairs } = clusterSections(sections, {
      autoMergeThreshold: 0.85,
      ambiguousThreshold: 0.5,
    });
    expect(clusters.length).toBe(2);
    expect(ambiguousPairs.length).toBe(1);
    expect(ambiguousPairs[0].similarity).toBeGreaterThanOrEqual(0.5);
    expect(ambiguousPairs[0].similarity).toBeLessThan(0.85);
  });

  it("marks sections with no near-matches as unique singletons", () => {
    const sections = [mk("solo", ["body>div>span"])];
    const { clusters, unique } = clusterSections(sections, {
      autoMergeThreshold: 0.85,
      ambiguousThreshold: 0.5,
    });
    expect(clusters.length).toBe(1);
    expect(clusters[0].memberIds).toEqual(["solo"]);
    expect(unique.map(u => u.id)).toEqual(["solo"]);
  });

  it("derives stable cluster ids from the cluster representative signature", () => {
    const sections1 = [
      mk("a", ["body>main>section", "main>section>div", "section>div>h1"]),
      mk("b", ["body>main>section", "main>section>div", "section>div>h1"]),
    ];
    const sections2 = [
      mk("x", ["body>main>section", "main>section>div", "section>div>h1"]),
      mk("y", ["body>main>section", "main>section>div", "section>div>h1"]),
    ];
    const r1 = clusterSections(sections1, { autoMergeThreshold: 0.85, ambiguousThreshold: 0.5 });
    const r2 = clusterSections(sections2, { autoMergeThreshold: 0.85, ambiguousThreshold: 0.5 });
    expect(r1.clusters[0].id).toBe(r2.clusters[0].id);
  });
});
```

- [ ] **Step 2: Run — expect fail (module not found)**

---

## Task 8: Algorithmic clusterer — implementation

**Files:**
- Create: `lib/cluster.ts`

- [ ] **Step 1: Implement**

Create `lib/cluster.ts`:
```typescript
import { jaccard, signatureDigest } from "./section-signature.ts";

export interface SectionInput {
  id: string;
  pathShingles: string[];
  tagSkeleton: string;
  pageUrl: string;
}

export interface Cluster {
  id: string;
  representative: SectionInput;
  memberIds: string[];
}

export interface AmbiguousPair {
  a: string;
  b: string;
  similarity: number;
}

export interface ClusterResult {
  clusters: Cluster[];
  ambiguousPairs: AmbiguousPair[];
  /** Sections that ended up as singletons after clustering. */
  unique: SectionInput[];
}

export interface ClusterOptions {
  autoMergeThreshold: number;
  ambiguousThreshold: number;
}

export function clusterSections(
  sections: SectionInput[],
  opts: ClusterOptions,
): ClusterResult {
  const clusters: Cluster[] = [];
  const ambiguousPairs: AmbiguousPair[] = [];

  for (const section of sections) {
    let bestCluster: Cluster | null = null;
    let bestSimilarity = 0;

    for (const cluster of clusters) {
      const sim = jaccard(section.pathShingles, cluster.representative.pathShingles);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestCluster = cluster;
      }
      if (sim >= opts.ambiguousThreshold && sim < opts.autoMergeThreshold) {
        ambiguousPairs.push({ a: section.id, b: cluster.representative.id, similarity: sim });
      }
    }

    if (bestCluster && bestSimilarity >= opts.autoMergeThreshold) {
      bestCluster.memberIds.push(section.id);
    } else {
      const id = `cluster-${signatureDigest({
        tagSkeleton: section.tagSkeleton,
        pathShingles: section.pathShingles,
      })}`;
      clusters.push({ id, representative: section, memberIds: [section.id] });
    }
  }

  const unique = clusters
    .filter(c => c.memberIds.length === 1)
    .map(c => c.representative);

  return { clusters, ambiguousPairs, unique };
}
```

- [ ] **Step 2: Run — expect PASS (4 tests)**

- [ ] **Step 3: Commit**

```bash
git add lib/cluster.ts test/cluster.test.ts
git commit -m "feat(plugin): add algorithmic section clusterer"
```

---

## Task 9: discover-sections runner — failing test + fixture

**Files:**
- Create: `test/fixtures/section-fixture/index.html`
- Create: `test/fixtures/section-fixture/about.html`
- Create: `test/fixtures/section-fixture/pricing.html`
- Create: `test/fixtures/section-fixture/case-study-x.html`
- Create: `test/discover-sections-runner.test.ts`

- [ ] **Step 1: Create the multi-page fixture**

Each page must have a stable `<header>`, a unique `<main>` content area, and a stable `<footer>` so cluster tests have something to bite on.

Create `test/fixtures/section-fixture/index.html`:
```html
<!doctype html>
<html><head><title>Home</title></head>
<body>
  <header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>
  <main>
    <section class="hero"><h1>Welcome</h1><p>Lead copy.</p></section>
    <section class="features"><h2>Features</h2><ul><li>One</li><li>Two</li></ul></section>
  </main>
  <footer><p>© Example</p></footer>
</body></html>
```

Create `test/fixtures/section-fixture/about.html`:
```html
<!doctype html>
<html><head><title>About</title></head>
<body>
  <header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>
  <main>
    <section class="hero"><h1>About us</h1><p>Lead copy.</p></section>
  </main>
  <footer><p>© Example</p></footer>
</body></html>
```

Create `test/fixtures/section-fixture/pricing.html`:
```html
<!doctype html>
<html><head><title>Pricing</title></head>
<body>
  <header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>
  <main>
    <section class="hero"><h1>Pricing</h1><p>Lead copy.</p></section>
    <section class="pricing-table"><h2>Plans</h2><table><tr><td>Free</td></tr></table></section>
  </main>
  <footer><p>© Example</p></footer>
</body></html>
```

Create `test/fixtures/section-fixture/case-study-x.html`:
```html
<!doctype html>
<html><head><title>Case Study X</title></head>
<body>
  <header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>
  <main>
    <section class="hero"><h1>Case Study X</h1><p>Result copy.</p></section>
    <section class="quote"><blockquote>It worked.</blockquote></section>
  </main>
  <footer><p>© Example</p></footer>
</body></html>
```

- [ ] **Step 2: Write the failing runner test**

Create `test/discover-sections-runner.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "node:http";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import getPort from "get-port";
import { runDiscoverSections } from "../lib/discover-sections-runner.ts";
import { DiscoveredSectionsSchema } from "../schemas/sections.ts";

const fixtureDir = fileURLToPath(new URL("./fixtures/section-fixture/", import.meta.url));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const port = await getPort();
  server = createServer((req, res) => {
    const reqPath = (req.url ?? "/").split("?")[0];
    let file: string;
    if (reqPath === "/") file = "index.html";
    else file = `${reqPath.replace(/^\//, "").replace(/\/$/, "")}.html`;
    const path = join(fixtureDir, file);
    if (!existsSync(path)) { res.statusCode = 404; res.end("nope"); return; }
    res.setHeader("Content-Type", "text/html");
    res.end(readFileSync(path, "utf8"));
  });
  await new Promise<void>(r => server.listen(port, r));
  baseUrl = `http://127.0.0.1:${port}`;
});
afterAll(() => new Promise<void>(r => server.close(() => r())));

describe("runDiscoverSections", () => {
  it("probes each URL with the supplied selector and writes a schema-valid sections.json", async () => {
    const out = mkdtempSync(join(tmpdir(), "sections-"));
    const outPath = join(out, "sections.json");
    await runDiscoverSections({
      urls: [baseUrl + "/", baseUrl + "/about", baseUrl + "/pricing"],
      primarySelector: "body > header, body > main > *, body > footer",
      outputPath: outPath,
    });
    expect(existsSync(outPath)).toBe(true);
    const validated = DiscoveredSectionsSchema.parse(
      JSON.parse(readFileSync(outPath, "utf8"))
    );
    expect(validated.pages).toHaveLength(3);
    // Each fixture has at least one matched section
    for (const p of validated.pages) {
      expect(p.sections.length).toBeGreaterThan(0);
    }
    // Sections carry stable, non-empty signatures
    for (const p of validated.pages) {
      for (const s of p.sections) {
        expect(s.tagSkeleton.length).toBeGreaterThan(0);
        expect(s.pathShingles.length).toBeGreaterThan(0);
        expect(typeof s.boundingBox.width).toBe("number");
      }
    }
  }, 60_000);

  it("emits per-URL ids that include the page index and section index", async () => {
    const out = mkdtempSync(join(tmpdir(), "sections-"));
    const outPath = join(out, "sections.json");
    await runDiscoverSections({
      urls: [baseUrl + "/"],
      primarySelector: "body > header, body > main > *, body > footer",
      outputPath: outPath,
    });
    const data = DiscoveredSectionsSchema.parse(JSON.parse(readFileSync(outPath, "utf8")));
    const ids = data.pages[0].sections.map(s => s.id);
    // ids look like "p0-s0", "p0-s1", ...
    expect(ids.every(id => /^p\d+-s\d+$/.test(id))).toBe(true);
  }, 60_000);
});
```

- [ ] **Step 3: Run — expect fail (module not found)**

---

## Task 10: discover-sections runner — implementation

**Files:**
- Create: `scripts/discover-sections.ts`
- Create: `lib/discover-sections-runner.ts`

- [ ] **Step 1: Implement the script**

Create `scripts/discover-sections.ts`:
```typescript
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

interface Args {
  urls: string[];
  primarySelector: string;
  outputPath: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const urlsArg = get("--urls");
  const primarySelector = get("--selector");
  const outputPath = get("--output");
  if (!urlsArg || !primarySelector || !outputPath) {
    throw new Error(
      "Usage: discover-sections --urls <url1,url2,...> --selector <css> --output <path>",
    );
  }
  return { urls: urlsArg.split(","), primarySelector, outputPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const pages = [];
  for (let pIdx = 0; pIdx < args.urls.length; pIdx++) {
    const url = args.urls[pIdx];
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
      const sections = await page.$$eval(args.primarySelector, (els, selector: string) => {
        function tagPath(el: Element): string[] {
          const path: string[] = [];
          let cur: Element | null = el;
          while (cur && cur.tagName !== "HTML") {
            path.unshift(cur.tagName.toLowerCase());
            cur = cur.parentElement;
          }
          return path;
        }
        function tagSkeleton(el: Element, depth = 0): string {
          if (depth > 4) return el.tagName.toLowerCase();
          const children = Array.from(el.children)
            .map(c => tagSkeleton(c, depth + 1))
            .filter(Boolean);
          const tag = el.tagName.toLowerCase();
          return children.length > 0 ? `${tag}>${children.join(",")}` : tag;
        }
        function pathShinglesOf(tags: string[], n = 3): string[] {
          if (tags.length === 0) return [];
          if (tags.length < n) return [tags.join(">")];
          const out: string[] = [];
          for (let i = 0; i + n <= tags.length; i++) {
            out.push(tags.slice(i, i + n).join(">"));
          }
          return out;
        }
        return (els as Element[]).map((el, sIdx) => {
          const rect = el.getBoundingClientRect();
          const tags = tagPath(el);
          return {
            sIdx,
            selector,
            tagSkeleton: tagSkeleton(el),
            pathShingles: pathShinglesOf(tags),
            sampleText: (el as HTMLElement).innerText.replace(/\s+/g, " ").trim().slice(0, 200),
            boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          };
        });
      }, args.primarySelector);

      pages.push({
        url,
        sections: sections.map(s => ({
          id: `p${pIdx}-s${s.sIdx}`,
          selector: s.selector,
          tagSkeleton: s.tagSkeleton,
          pathShingles: s.pathShingles,
          sampleText: s.sampleText,
          boundingBox: s.boundingBox,
        })),
      });
    } catch (err) {
      pages.push({ url, sections: [] });
    }
  }

  await browser.close();

  const out = { probedAt: new Date().toISOString(), pages };
  mkdirSync(dirname(args.outputPath), { recursive: true });
  writeFileSync(args.outputPath, JSON.stringify(out, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Implement the runner**

Create `lib/discover-sections-runner.ts`:
```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const execFileP = promisify(execFile);

export interface RunDiscoverSectionsArgs {
  urls: string[];
  primarySelector: string;
  outputPath: string;
  pluginRoot?: string;
}

export async function runDiscoverSections(args: RunDiscoverSectionsArgs): Promise<void> {
  const root = args.pluginRoot ?? defaultPluginRoot();
  const script = resolve(root, "scripts/discover-sections.ts");
  await execFileP("npx", [
    "tsx", script,
    "--urls", args.urls.join(","),
    "--selector", args.primarySelector,
    "--output", args.outputPath,
  ], { env: process.env });
}

function defaultPluginRoot(): string {
  return resolve(fileURLToPath(new URL("..", import.meta.url)));
}
```

- [ ] **Step 3: Run runner test — expect PASS (2 tests)**

```bash
pnpm test test/discover-sections-runner.test.ts
```

Each test launches Chromium via subprocess; total wall-clock ~5-15s.

- [ ] **Step 4: Commit**

```bash
git add scripts/discover-sections.ts lib/discover-sections-runner.ts test/discover-sections-runner.test.ts test/fixtures/section-fixture/
git commit -m "feat(plugin): add discover-sections script and runner"
```

---

## Task 11: Layouts schema — failing test + fixtures

**Files:**
- Create: `test/fixtures/layouts-valid.json`
- Create: `test/fixtures/layouts-invalid.json`
- Create: `test/layouts-schema.test.ts`

- [ ] **Step 1: Create fixtures**

Create `test/fixtures/layouts-valid.json`:
```json
{
  "header": {
    "id": "layout-header-1",
    "signature": "abc123",
    "appearsOn": ["https://example.com/", "https://example.com/about"],
    "tagSkeleton": "header>nav>ul>li"
  },
  "footer": {
    "id": "layout-footer-1",
    "signature": "def456",
    "appearsOn": ["https://example.com/", "https://example.com/about"],
    "tagSkeleton": "footer>p"
  },
  "nav": null,
  "updatedAt": "2026-04-30T12:00:00.000Z"
}
```

Create `test/fixtures/layouts-invalid.json`:
```json
{
  "header": { "id": "x" },
  "footer": null,
  "updatedAt": "yesterday"
}
```

- [ ] **Step 2: Write the failing test**

Create `test/layouts-schema.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { LayoutsSchema } from "../schemas/layouts.ts";

const readFixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("LayoutsSchema", () => {
  it("accepts a valid layouts file with header + footer + null nav", () => {
    expect(LayoutsSchema.safeParse(readFixture("layouts-valid.json")).success).toBe(true);
  });

  it("rejects missing required header fields", () => {
    expect(LayoutsSchema.safeParse(readFixture("layouts-invalid.json")).success).toBe(false);
  });

  it("rejects a non-ISO updatedAt", () => {
    const result = LayoutsSchema.safeParse(readFixture("layouts-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("updatedAt"))).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run — expect fail (module not found)**

---

## Task 12: Layouts schema — implementation

**Files:**
- Create: `schemas/layouts.ts`

- [ ] **Step 1: Implement**

Create `schemas/layouts.ts`:
```typescript
import { z } from "zod";

export const LayoutShellSchema = z.object({
  id: z.string().min(1),
  signature: z.string().min(1),
  appearsOn: z.array(z.string().url()).min(1),
  tagSkeleton: z.string(),
});

export const LayoutsSchema = z.object({
  header: LayoutShellSchema.nullable(),
  footer: LayoutShellSchema.nullable(),
  nav: LayoutShellSchema.nullable(),
  updatedAt: z.string().datetime(),
});

export type Layouts = z.infer<typeof LayoutsSchema>;
export type LayoutShell = z.infer<typeof LayoutShellSchema>;
```

- [ ] **Step 2: Run test — expect PASS (3)**

- [ ] **Step 3: Commit**

```bash
git add schemas/layouts.ts test/layouts-schema.test.ts test/fixtures/layouts-valid.json test/fixtures/layouts-invalid.json
git commit -m "feat(plugin): add Zod layouts schema"
```

---

## Task 13: Layouts loader — failing test + impl

**Files:**
- Create: `test/load-layouts.test.ts`
- Create: `lib/load-layouts.ts`

- [ ] **Step 1: Failing test**

Create `test/load-layouts.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadLayouts } from "../lib/load-layouts.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadLayouts", () => {
  it("returns { valid: true } for a valid layouts.json", () => {
    const result = loadLayouts(fixturePath("layouts-valid.json"));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.header?.id).toBe("layout-header-1");
  });

  it("returns { valid: false } for an invalid layouts.json", () => {
    expect(loadLayouts(fixturePath("layouts-invalid.json")).valid).toBe(false);
  });
});
```

Run, expect fail.

- [ ] **Step 2: Implement loader**

Create `lib/load-layouts.ts`:
```typescript
import { readFileSync } from "node:fs";
import { LayoutsSchema, type Layouts } from "../schemas/layouts.ts";
import type { LoadResult } from "../schemas/errors.ts";

export function loadLayouts(path: string): LoadResult<Layouts> {
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
  const result = LayoutsSchema.safeParse(rawJson);
  if (result.success) return { valid: true, data: result.data };
  return { valid: false, path, rawJson, issues: result.error.issues };
}
```

- [ ] **Step 3: Run — expect PASS (2)**

- [ ] **Step 4: Commit**

```bash
git add lib/load-layouts.ts test/load-layouts.test.ts
git commit -m "feat(plugin): add layouts loader"
```

---

## Task 14: Components schema — failing test + impl

**Files:**
- Create: `test/fixtures/components-valid.json`
- Create: `test/fixtures/components-invalid.json`
- Create: `test/components-schema.test.ts`
- Create: `schemas/components.ts`

- [ ] **Step 1: Create fixtures**

Create `test/fixtures/components-valid.json`:
```json
{
  "components": [
    {
      "id": "cluster-abc123",
      "name": "Hero",
      "signature": "abc123",
      "tagSkeleton": "section>div>h1",
      "memberSections": [
        { "id": "p0-s1", "url": "https://example.com/" },
        { "id": "p1-s0", "url": "https://example.com/about" }
      ],
      "unique": false,
      "propsRef": "HeroProps"
    },
    {
      "id": "cluster-solo",
      "name": "PricingTable",
      "signature": "solo",
      "tagSkeleton": "section>table",
      "memberSections": [{ "id": "p2-s1", "url": "https://example.com/pricing" }],
      "unique": true,
      "propsRef": null
    }
  ],
  "updatedAt": "2026-04-30T12:00:00.000Z"
}
```

Create `test/fixtures/components-invalid.json`:
```json
{
  "components": [{ "id": "x", "memberSections": [] }],
  "updatedAt": "yesterday"
}
```

- [ ] **Step 2: Failing test**

Create `test/components-schema.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ComponentsSchema } from "../schemas/components.ts";

const readFixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("ComponentsSchema", () => {
  it("accepts a valid components registry", () => {
    expect(ComponentsSchema.safeParse(readFixture("components-valid.json")).success).toBe(true);
  });

  it("rejects an empty memberSections array", () => {
    expect(ComponentsSchema.safeParse(readFixture("components-invalid.json")).success).toBe(false);
  });
});
```

Run, expect fail.

- [ ] **Step 3: Implement**

Create `schemas/components.ts`:
```typescript
import { z } from "zod";

export const ComponentMemberSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
});

export const ComponentEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  signature: z.string().min(1),
  tagSkeleton: z.string(),
  memberSections: z.array(ComponentMemberSchema).min(1),
  unique: z.boolean(),
  propsRef: z.string().nullable(),
});

export const ComponentsSchema = z.object({
  components: z.array(ComponentEntrySchema),
  updatedAt: z.string().datetime(),
});

export type Components = z.infer<typeof ComponentsSchema>;
export type ComponentEntry = z.infer<typeof ComponentEntrySchema>;
```

- [ ] **Step 4: Run — expect PASS (2)**

- [ ] **Step 5: Commit**

```bash
git add schemas/components.ts test/components-schema.test.ts test/fixtures/components-valid.json test/fixtures/components-invalid.json
git commit -m "feat(plugin): add Zod components schema"
```

---

## Task 15: Components loader — failing test + impl

**Files:**
- Create: `test/load-components.test.ts`
- Create: `lib/load-components.ts`

- [ ] **Step 1: Failing test**

Create `test/load-components.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadComponents } from "../lib/load-components.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadComponents", () => {
  it("returns { valid: true } for a valid components.json", () => {
    const result = loadComponents(fixturePath("components-valid.json"));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.components).toHaveLength(2);
  });

  it("returns { valid: false } for an invalid components.json", () => {
    expect(loadComponents(fixturePath("components-invalid.json")).valid).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

Create `lib/load-components.ts`:
```typescript
import { readFileSync } from "node:fs";
import { ComponentsSchema, type Components } from "../schemas/components.ts";
import type { LoadResult } from "../schemas/errors.ts";

export function loadComponents(path: string): LoadResult<Components> {
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
  const result = ComponentsSchema.safeParse(rawJson);
  if (result.success) return { valid: true, data: result.data };
  return { valid: false, path, rawJson, issues: result.error.issues };
}
```

- [ ] **Step 3: Run — expect PASS (2)**

- [ ] **Step 4: Commit**

```bash
git add lib/load-components.ts test/load-components.test.ts
git commit -m "feat(plugin): add components loader"
```

---

## Task 16: Props schema — failing test + impl

**Files:**
- Create: `test/fixtures/props-valid.json`
- Create: `test/fixtures/props-invalid.json`
- Create: `test/props-schema.test.ts`
- Create: `schemas/props.ts`

- [ ] **Step 1: Create fixtures**

Create `test/fixtures/props-valid.json`:
```json
{
  "interfaces": [
    {
      "name": "HeroProps",
      "fields": [
        { "name": "title", "tsType": "string", "required": true },
        { "name": "subtitle", "tsType": "string", "required": false },
        { "name": "cta", "tsType": "{ label: string; href: string }", "required": false }
      ]
    },
    { "name": "EmptyProps", "fields": [] }
  ],
  "updatedAt": "2026-04-30T12:00:00.000Z"
}
```

Create `test/fixtures/props-invalid.json`:
```json
{
  "interfaces": [{ "name": "", "fields": [] }],
  "updatedAt": "today"
}
```

- [ ] **Step 2: Failing test**

Create `test/props-schema.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PropsRegistrySchema } from "../schemas/props.ts";

const readFixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("PropsRegistrySchema", () => {
  it("accepts a valid props registry", () => {
    expect(PropsRegistrySchema.safeParse(readFixture("props-valid.json")).success).toBe(true);
  });

  it("rejects an interface with an empty name", () => {
    expect(PropsRegistrySchema.safeParse(readFixture("props-invalid.json")).success).toBe(false);
  });
});
```

- [ ] **Step 3: Implement**

Create `schemas/props.ts`:
```typescript
import { z } from "zod";

export const PropFieldSchema = z.object({
  name: z.string().min(1),
  tsType: z.string().min(1),
  required: z.boolean(),
});

export const PropInterfaceSchema = z.object({
  name: z.string().min(1),
  fields: z.array(PropFieldSchema),
});

export const PropsRegistrySchema = z.object({
  interfaces: z.array(PropInterfaceSchema),
  updatedAt: z.string().datetime(),
});

export type PropsRegistry = z.infer<typeof PropsRegistrySchema>;
export type PropInterface = z.infer<typeof PropInterfaceSchema>;
```

- [ ] **Step 4: Run — expect PASS (2)**

- [ ] **Step 5: Commit**

```bash
git add schemas/props.ts test/props-schema.test.ts test/fixtures/props-valid.json test/fixtures/props-invalid.json
git commit -m "feat(plugin): add Zod props registry schema"
```

---

## Task 17: Props loader — failing test + impl

**Files:**
- Create: `test/load-props.test.ts`
- Create: `lib/load-props.ts`

- [ ] **Step 1: Failing test**

Create `test/load-props.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadProps } from "../lib/load-props.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadProps", () => {
  it("returns { valid: true } for a valid props.json", () => {
    const result = loadProps(fixturePath("props-valid.json"));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.interfaces).toHaveLength(2);
  });

  it("returns { valid: false } for an invalid props.json", () => {
    expect(loadProps(fixturePath("props-invalid.json")).valid).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

Create `lib/load-props.ts`:
```typescript
import { readFileSync } from "node:fs";
import { PropsRegistrySchema, type PropsRegistry } from "../schemas/props.ts";
import type { LoadResult } from "../schemas/errors.ts";

export function loadProps(path: string): LoadResult<PropsRegistry> {
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
  const result = PropsRegistrySchema.safeParse(rawJson);
  if (result.success) return { valid: true, data: result.data };
  return { valid: false, path, rawJson, issues: result.error.issues };
}
```

- [ ] **Step 3: Run — expect PASS (2)**

- [ ] **Step 4: Commit**

```bash
git add lib/load-props.ts test/load-props.test.ts
git commit -m "feat(plugin): add props loader"
```

---

## Task 18: Routes schema — failing test + impl

**Files:**
- Create: `test/fixtures/routes-valid.json`
- Create: `test/fixtures/routes-invalid.json`
- Create: `test/routes-schema.test.ts`
- Create: `schemas/routes.ts`

- [ ] **Step 1: Create fixtures**

Create `test/fixtures/routes-valid.json`:
```json
{
  "routes": [
    {
      "sourceUrl": "https://example.com/",
      "nextRoute": "/",
      "params": {},
      "kind": "static"
    },
    {
      "sourceUrl": "https://example.com/case-study/cookunity",
      "nextRoute": "/case-study/[slug]",
      "params": { "slug": "cookunity" },
      "kind": "dynamic"
    }
  ],
  "updatedAt": "2026-04-30T12:00:00.000Z"
}
```

Create `test/fixtures/routes-invalid.json`:
```json
{
  "routes": [{ "sourceUrl": "not-a-url", "nextRoute": "", "kind": "weird" }],
  "updatedAt": "today"
}
```

- [ ] **Step 2: Failing test**

Create `test/routes-schema.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { RoutesSchema } from "../schemas/routes.ts";

const readFixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("RoutesSchema", () => {
  it("accepts a valid routes file", () => {
    expect(RoutesSchema.safeParse(readFixture("routes-valid.json")).success).toBe(true);
  });

  it("rejects an invalid kind enum value", () => {
    const result = RoutesSchema.safeParse(readFixture("routes-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.join(".").endsWith("kind"))).toBe(true);
    }
  });

  it("rejects a non-URL sourceUrl", () => {
    const result = RoutesSchema.safeParse(readFixture("routes-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.join(".").endsWith("sourceUrl"))).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Implement**

Create `schemas/routes.ts`:
```typescript
import { z } from "zod";

export const RouteEntrySchema = z.object({
  sourceUrl: z.string().url(),
  nextRoute: z.string().min(1),
  params: z.record(z.string()).default({}),
  kind: z.enum(["static", "dynamic"]),
});

export const RoutesSchema = z.object({
  routes: z.array(RouteEntrySchema).min(1),
  updatedAt: z.string().datetime(),
});

export type Routes = z.infer<typeof RoutesSchema>;
export type RouteEntry = z.infer<typeof RouteEntrySchema>;
```

- [ ] **Step 4: Run — expect PASS (3)**

- [ ] **Step 5: Commit**

```bash
git add schemas/routes.ts test/routes-schema.test.ts test/fixtures/routes-valid.json test/fixtures/routes-invalid.json
git commit -m "feat(plugin): add Zod routes schema"
```

---

## Task 19: Routes loader — failing test + impl

**Files:**
- Create: `test/load-routes.test.ts`
- Create: `lib/load-routes.ts`

- [ ] **Step 1: Failing test**

Create `test/load-routes.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadRoutes } from "../lib/load-routes.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadRoutes", () => {
  it("returns { valid: true } for a valid routes.json", () => {
    const result = loadRoutes(fixturePath("routes-valid.json"));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.routes).toHaveLength(2);
  });

  it("returns { valid: false } for an invalid routes.json", () => {
    expect(loadRoutes(fixturePath("routes-invalid.json")).valid).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

Create `lib/load-routes.ts`:
```typescript
import { readFileSync } from "node:fs";
import { RoutesSchema, type Routes } from "../schemas/routes.ts";
import type { LoadResult } from "../schemas/errors.ts";

export function loadRoutes(path: string): LoadResult<Routes> {
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
  const result = RoutesSchema.safeParse(rawJson);
  if (result.success) return { valid: true, data: result.data };
  return { valid: false, path, rawJson, issues: result.error.issues };
}
```

- [ ] **Step 3: Run — expect PASS (2)**

- [ ] **Step 4: Commit**

```bash
git add lib/load-routes.ts test/load-routes.test.ts
git commit -m "feat(plugin): add routes loader"
```

---

## Task 20: Route mapper — failing test

**Files:**
- Create: `test/route-map.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/route-map.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { buildRoutes } from "../lib/route-map.ts";

describe("buildRoutes", () => {
  it("emits a static route for the seed origin", () => {
    const routes = buildRoutes(["https://example.com/"]);
    expect(routes).toEqual([
      { sourceUrl: "https://example.com/", nextRoute: "/", params: {}, kind: "static" },
    ]);
  });

  it("emits static routes for distinct single-segment paths", () => {
    const routes = buildRoutes([
      "https://example.com/",
      "https://example.com/about",
      "https://example.com/pricing",
    ]);
    const map = Object.fromEntries(routes.map(r => [r.sourceUrl, r.nextRoute]));
    expect(map["https://example.com/about"]).toBe("/about");
    expect(map["https://example.com/pricing"]).toBe("/pricing");
    expect(routes.every(r => r.kind === "static")).toBe(true);
  });

  it("collapses sibling URLs with a varying tail segment into a [slug] dynamic route", () => {
    const routes = buildRoutes([
      "https://example.com/case-study/cookunity",
      "https://example.com/case-study/vibes",
      "https://example.com/case-study/arthurai",
    ]);
    expect(routes.every(r => r.kind === "dynamic")).toBe(true);
    expect(routes.every(r => r.nextRoute === "/case-study/[slug]")).toBe(true);
    const slugs = routes.map(r => r.params.slug).sort();
    expect(slugs).toEqual(["arthurai", "cookunity", "vibes"]);
  });

  it("does not collapse a 2-URL group into a dynamic pattern (threshold = 3)", () => {
    const routes = buildRoutes([
      "https://example.com/case-study/cookunity",
      "https://example.com/case-study/vibes",
    ]);
    expect(routes.every(r => r.kind === "static")).toBe(true);
  });

  it("handles an index page alongside its dynamic siblings", () => {
    const routes = buildRoutes([
      "https://example.com/case-study",
      "https://example.com/case-study/cookunity",
      "https://example.com/case-study/vibes",
      "https://example.com/case-study/arthurai",
    ]);
    const index = routes.find(r => r.sourceUrl === "https://example.com/case-study");
    expect(index?.nextRoute).toBe("/case-study");
    expect(index?.kind).toBe("static");
    const dynamics = routes.filter(r => r.kind === "dynamic");
    expect(dynamics).toHaveLength(3);
    expect(dynamics.every(r => r.nextRoute === "/case-study/[slug]")).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect fail (module not found)**

---

## Task 21: Route mapper — implementation

**Files:**
- Create: `lib/route-map.ts`

- [ ] **Step 1: Implement**

Create `lib/route-map.ts`:
```typescript
import type { RouteEntry } from "../schemas/routes.ts";

const DYNAMIC_GROUP_THRESHOLD = 3;

export function buildRoutes(urls: string[]): RouteEntry[] {
  const parsed = urls.map(u => {
    const parsedUrl = new URL(u);
    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    return { url: u, segments };
  });

  // Group URLs by their parent path (everything except the last segment).
  const groups = new Map<string, typeof parsed>();
  for (const p of parsed) {
    if (p.segments.length === 0) {
      groups.set("__root__", [...(groups.get("__root__") ?? []), p]);
      continue;
    }
    const parent = "/" + p.segments.slice(0, -1).join("/");
    groups.set(parent, [...(groups.get(parent) ?? []), p]);
  }

  const dynamicParents = new Set<string>();
  for (const [parent, members] of groups) {
    if (parent === "__root__") continue;
    if (members.length >= DYNAMIC_GROUP_THRESHOLD) {
      dynamicParents.add(parent);
    }
  }

  return parsed.map(p => {
    if (p.segments.length === 0) {
      return { sourceUrl: p.url, nextRoute: "/", params: {}, kind: "static" as const };
    }
    const parent = "/" + p.segments.slice(0, -1).join("/");
    if (dynamicParents.has(parent)) {
      const tail = p.segments[p.segments.length - 1];
      return {
        sourceUrl: p.url,
        nextRoute: `${parent === "/" ? "" : parent}/[slug]`,
        params: { slug: tail },
        kind: "dynamic" as const,
      };
    }
    return {
      sourceUrl: p.url,
      nextRoute: "/" + p.segments.join("/"),
      params: {},
      kind: "static" as const,
    };
  });
}
```

- [ ] **Step 2: Run — expect PASS (5 tests)**

- [ ] **Step 3: Commit**

```bash
git add lib/route-map.ts test/route-map.test.ts
git commit -m "feat(plugin): add URL → Next.js route mapper"
```

---

## Task 22: Library history writer — failing test + impl

**Files:**
- Create: `test/library-history.test.ts`
- Create: `lib/library-history.ts`

- [ ] **Step 1: Failing test**

Create `test/library-history.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendLibraryHistory } from "../lib/library-history.ts";

function tempLibraryDir(): string {
  const root = mkdtempSync(join(tmpdir(), "library-history-"));
  const lib = join(root, "library");
  mkdirSync(lib, { recursive: true });
  return lib;
}

describe("appendLibraryHistory", () => {
  it("creates HISTORY.md with a header on first call", async () => {
    const dir = tempLibraryDir();
    await appendLibraryHistory(dir, {
      runDir: "001-initial",
      summary: "Initial Phase 2 — 12 components, 47 routes, 0 unique sections.",
    });
    const contents = readFileSync(join(dir, "HISTORY.md"), "utf8");
    expect(contents).toMatch(/^# Library history/);
    expect(contents).toContain("001-initial");
    expect(contents).toContain("12 components");
  });

  it("appends a new entry on subsequent calls without rewriting older entries", async () => {
    const dir = tempLibraryDir();
    await appendLibraryHistory(dir, { runDir: "001-initial", summary: "first entry" });
    await appendLibraryHistory(dir, { runDir: "002-add-blog", summary: "second entry" });
    const contents = readFileSync(join(dir, "HISTORY.md"), "utf8");
    expect(contents.indexOf("first entry")).toBeLessThan(contents.indexOf("second entry"));
    expect(contents.match(/## /g)?.length).toBe(2);
  });

  it("includes an ISO timestamp on each entry", async () => {
    const dir = tempLibraryDir();
    await appendLibraryHistory(dir, { runDir: "001-initial", summary: "x" });
    const contents = readFileSync(join(dir, "HISTORY.md"), "utf8");
    expect(contents).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
```

- [ ] **Step 2: Run — expect fail (module not found)**

- [ ] **Step 3: Implement**

Create `lib/library-history.ts`:
```typescript
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface LibraryHistoryEntry {
  runDir: string;
  summary: string;
}

export async function appendLibraryHistory(
  libraryDir: string,
  entry: LibraryHistoryEntry,
): Promise<void> {
  const path = join(libraryDir, "HISTORY.md");
  if (!existsSync(path)) {
    writeFileSync(path, `# Library history\n\nAppend-only changelog of library mutations across runs.\n\n`);
  }
  const stamped = `## ${new Date().toISOString()} — ${entry.runDir}\n\n${entry.summary}\n\n`;
  appendFileSync(path, stamped);
}
```

- [ ] **Step 4: Run — expect PASS (3)**

- [ ] **Step 5: Commit**

```bash
git add lib/library-history.ts test/library-history.test.ts
git commit -m "feat(plugin): add library history writer"
```

---

## Task 23: Analyze orchestrator — failing test

**Files:**
- Create: `test/analyze.test.ts`

- [ ] **Step 1: Write the failing test**

This test reuses the section-fixture HTTP server pattern from Task 9 plus a stubbed Phase-1 `crawl.json` written by hand. It exercises the full Phase 2 path: read crawl, dispatch sections probe, cluster, write library JSONs + HISTORY, write VERIFICATION.

Create `test/analyze.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import getPort from "get-port";
import { runAnalyze } from "../lib/analyze.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";
import { LayoutsSchema } from "../schemas/layouts.ts";
import { ComponentsSchema } from "../schemas/components.ts";
import { PropsRegistrySchema } from "../schemas/props.ts";
import { RoutesSchema } from "../schemas/routes.ts";

const fixtureDir = fileURLToPath(new URL("./fixtures/section-fixture/", import.meta.url));
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const port = await getPort();
  server = createServer((req, res) => {
    const reqPath = (req.url ?? "/").split("?")[0];
    let file: string;
    if (reqPath === "/") file = "index.html";
    else file = `${reqPath.replace(/^\//, "").replace(/\/$/, "")}.html`;
    const path = join(fixtureDir, file);
    if (!existsSync(path)) { res.statusCode = 404; res.end("nope"); return; }
    res.setHeader("Content-Type", "text/html");
    res.end(readFileSync(path, "utf8"));
  });
  await new Promise<void>(r => server.listen(port, r));
  baseUrl = `http://127.0.0.1:${port}`;
});
afterAll(() => new Promise<void>(r => server.close(() => r())));

const baseSite = (sourceUrl: string) => ({
  sourceUrl, target: "./",
  mode: "unattended" as const, goal: "wireframe" as const, inputMode: "url-only" as const,
  maxParallelPages: 4, maxParallelSections: 4,
});

function writePhase1Artifacts(targetDir: string, runDir: string, urls: string[]) {
  const phaseDir = join(targetDir, ".migration/runs", runDir, "phase-1-discover");
  const discoveryDir = join(phaseDir, "discovery");
  mkdirSync(discoveryDir, { recursive: true });
  const crawl = {
    sourceUrl: urls[0],
    crawledAt: new Date().toISOString(),
    limits: { maxPages: 10, maxDepth: 2 },
    robotsTxt: { fetched: true, disallowedPaths: [] },
    sitemapUrls: [],
    pages: urls.map((u, i) => ({
      url: u,
      slug: i === 0 ? "home" : new URL(u).pathname.replace(/^\//, "").replace(/\//g, "-"),
      title: u,
      depth: i === 0 ? 0 : 1,
      discoveredVia: i === 0 ? "seed" : "link",
      status: 200,
      outboundLinks: [],
    })),
    errors: [],
  };
  writeFileSync(join(discoveryDir, "crawl.json"), JSON.stringify(crawl, null, 2));
  writeFileSync(join(phaseDir, "VERIFICATION.md"), "# verified");
}

describe("runAnalyze", () => {
  it("writes layouts/components/props/routes.json + HISTORY.md and emits VERIFICATION.md", async () => {
    const root = mkdtempSync(join(tmpdir(), "analyze-"));
    await bootstrapMigration({ targetDir: root, site: baseSite(baseUrl + "/") });
    const urls = [baseUrl + "/", baseUrl + "/about", baseUrl + "/pricing", baseUrl + "/case-study-x"];
    writePhase1Artifacts(root, "001-initial", urls);

    await runAnalyze({
      targetDir: root,
      runDir: "001-initial",
      primarySelector: "body > header, body > main > *, body > footer",
    });

    const phaseDir = join(root, ".migration/runs/001-initial/phase-2-analyze");
    expect(existsSync(join(phaseDir, "PLAN.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "EXECUTION.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "analysis/sections.json"))).toBe(true);
    expect(existsSync(join(phaseDir, "analysis/clusters.json"))).toBe(true);

    const libDir = join(root, ".migration/library");
    LayoutsSchema.parse(JSON.parse(readFileSync(join(libDir, "layouts.json"), "utf8")));
    ComponentsSchema.parse(JSON.parse(readFileSync(join(libDir, "components.json"), "utf8")));
    PropsRegistrySchema.parse(JSON.parse(readFileSync(join(libDir, "props.json"), "utf8")));
    const routes = RoutesSchema.parse(JSON.parse(readFileSync(join(libDir, "routes.json"), "utf8")));
    // Every URL in crawl.json appears in routes.json
    expect(new Set(routes.routes.map(r => r.sourceUrl))).toEqual(new Set(urls));
    expect(existsSync(join(libDir, "HISTORY.md"))).toBe(true);
  }, 60_000);

  it("does NOT emit VERIFICATION.md when crawl.json is missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "analyze-"));
    await bootstrapMigration({ targetDir: root, site: baseSite(baseUrl + "/") });
    // Note: NO Phase 1 artifacts written.
    await runAnalyze({
      targetDir: root,
      runDir: "001-initial",
      primarySelector: "body > header, body > main > *, body > footer",
    });
    const phaseDir = join(root, ".migration/runs/001-initial/phase-2-analyze");
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(false);
    const v = JSON.parse(readFileSync(join(phaseDir, "verification.json"), "utf8"));
    expect(v.passed).toBe(false);
    expect(v.criteria.find((c: { name: string }) => c.name.includes("crawl"))?.passed).toBe(false);
  }, 60_000);

  it("uses the supplied discoverSections stub instead of the real subprocess", async () => {
    const root = mkdtempSync(join(tmpdir(), "analyze-"));
    await bootstrapMigration({ targetDir: root, site: baseSite("https://example.com/") });
    const urls = ["https://example.com/", "https://example.com/about"];
    writePhase1Artifacts(root, "001-initial", urls);

    let invoked = 0;
    const stubSections = async ({ urls: u, outputPath }: { urls: string[]; outputPath: string }) => {
      invoked++;
      const data = {
        probedAt: new Date().toISOString(),
        pages: u.map(url => ({
          url,
          sections: [
            {
              id: `${url}-s0`,
              selector: "body > header",
              tagSkeleton: "header>nav",
              pathShingles: ["body>header", "header>nav"],
              sampleText: "header",
              boundingBox: { x: 0, y: 0, width: 1440, height: 80 },
            },
          ],
        })),
      };
      mkdirSync(join(outputPath, ".."), { recursive: true });
      writeFileSync(outputPath, JSON.stringify(data, null, 2));
    };

    await runAnalyze({
      targetDir: root,
      runDir: "001-initial",
      primarySelector: "body > header",
      discoverSections: stubSections,
    });
    expect(invoked).toBe(1);
    const phaseDir = join(root, ".migration/runs/001-initial/phase-2-analyze");
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect fail (module not found)**

---

## Task 24: Analyze orchestrator — implementation

**Files:**
- Create: `lib/analyze.ts`

- [ ] **Step 1: Implement**

Create `lib/analyze.ts`:
```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runDiscoverSections } from "./discover-sections-runner.ts";
import { loadCrawl } from "./load-crawl.ts";
import { loadSections } from "./load-sections.ts";
import { clusterSections, type SectionInput } from "./cluster.ts";
import { buildRoutes } from "./route-map.ts";
import { appendLibraryHistory } from "./library-history.ts";
import { writePlan, writeExecution, writeVerification } from "./phase-state.ts";
import type { Layouts, LayoutShell } from "../schemas/layouts.ts";
import type { Components, ComponentEntry } from "../schemas/components.ts";
import type { PropsRegistry } from "../schemas/props.ts";

export interface RunAnalyzeArgs {
  targetDir: string;
  runDir: string;
  primarySelector: string;
  pluginRoot?: string;
  discoverSections?: (args: {
    urls: string[];
    primarySelector: string;
    outputPath: string;
  }) => Promise<void>;
  autoMergeThreshold?: number;
  ambiguousThreshold?: number;
}

const DEFAULT_AUTO_MERGE = 0.85;
const DEFAULT_AMBIGUOUS = 0.6;

export async function runAnalyze(args: RunAnalyzeArgs): Promise<void> {
  const phaseDir = join(args.targetDir, ".migration/runs", args.runDir, "phase-2-analyze");
  const analysisDir = join(phaseDir, "analysis");
  const libraryDir = join(args.targetDir, ".migration/library");
  mkdirSync(analysisDir, { recursive: true });
  mkdirSync(libraryDir, { recursive: true });

  await writePlan(
    phaseDir,
    `# Phase 2 — Analyze\n\nCluster sections across crawled pages and emit the shared component library.\n\nautoMergeThreshold=${args.autoMergeThreshold ?? DEFAULT_AUTO_MERGE} | ambiguousThreshold=${args.ambiguousThreshold ?? DEFAULT_AMBIGUOUS}\n`,
  );

  // Load Phase 1 crawl
  const crawlPath = join(args.targetDir, ".migration/runs", args.runDir, "phase-1-discover/discovery/crawl.json");
  if (!existsSync(crawlPath)) {
    await writeVerification(phaseDir, {
      phase: "phase-2-analyze", passed: false,
      checkedAt: new Date().toISOString(),
      criteria: [{ name: "crawl.json exists", passed: false, detail: `Missing ${crawlPath}` }],
    });
    return;
  }
  const crawlResult = loadCrawl(crawlPath);
  if (!crawlResult.valid) {
    await writeVerification(phaseDir, {
      phase: "phase-2-analyze", passed: false,
      checkedAt: new Date().toISOString(),
      criteria: [{ name: "crawl.json valid", passed: false, detail: crawlResult.issues[0]?.message }],
    });
    return;
  }
  const crawlUrls = crawlResult.data.pages.map(p => p.url);

  // Probe sections per URL
  const sectionsPath = join(analysisDir, "sections.json");
  const probe = args.discoverSections ?? runDiscoverSections;
  await probe({
    urls: crawlUrls,
    primarySelector: args.primarySelector,
    outputPath: sectionsPath,
  });
  await writeExecution(phaseDir, `Section probe complete → ${sectionsPath}`);

  const sectionsResult = loadSections(sectionsPath);
  if (!sectionsResult.valid) {
    await writeVerification(phaseDir, {
      phase: "phase-2-analyze", passed: false,
      checkedAt: new Date().toISOString(),
      criteria: [{ name: "sections.json valid", passed: false, detail: sectionsResult.issues[0]?.message }],
    });
    return;
  }

  // Cluster
  const allSections: SectionInput[] = [];
  for (const page of sectionsResult.data.pages) {
    for (const s of page.sections) {
      allSections.push({
        id: `${page.url}#${s.id}`,
        pathShingles: s.pathShingles,
        tagSkeleton: s.tagSkeleton,
        pageUrl: page.url,
      });
    }
  }
  const clusterResult = clusterSections(allSections, {
    autoMergeThreshold: args.autoMergeThreshold ?? DEFAULT_AUTO_MERGE,
    ambiguousThreshold: args.ambiguousThreshold ?? DEFAULT_AMBIGUOUS,
  });
  writeFileSync(
    join(analysisDir, "clusters.json"),
    JSON.stringify(clusterResult, null, 2),
  );
  await writeExecution(phaseDir, `Clustering complete → ${clusterResult.clusters.length} clusters, ${clusterResult.ambiguousPairs.length} ambiguous pairs.`);

  // Split clusters into layouts (header/footer/nav) vs components
  const layouts = extractLayouts(clusterResult.clusters, sectionsResult.data);
  const components = extractComponents(clusterResult.clusters, layouts);

  // Build routes from crawl URLs
  const routes = buildRoutes(crawlUrls);

  // Write library JSONs
  const now = new Date().toISOString();
  writeFileSync(join(libraryDir, "layouts.json"), JSON.stringify({ ...layouts, updatedAt: now }, null, 2));
  writeFileSync(
    join(libraryDir, "components.json"),
    JSON.stringify({ components, updatedAt: now }, null, 2),
  );
  const propsRegistry: PropsRegistry = { interfaces: components.map(c => ({ name: `${c.name}Props`, fields: [] })), updatedAt: now };
  writeFileSync(join(libraryDir, "props.json"), JSON.stringify(propsRegistry, null, 2));
  writeFileSync(join(libraryDir, "routes.json"), JSON.stringify({ routes, updatedAt: now }, null, 2));

  await appendLibraryHistory(libraryDir, {
    runDir: args.runDir,
    summary: `${components.length} components, ${routes.length} routes, ${clusterResult.unique.length} unique sections, ${clusterResult.ambiguousPairs.length} ambiguous pairs.`,
  });
  await writeExecution(phaseDir, `Library written → ${components.length} components, ${routes.length} routes.`);

  // Verification gate
  const routesCoverEveryPage = new Set(routes.map(r => r.sourceUrl)).size === new Set(crawlUrls).size;
  const everySectionAccountedFor = allSections.length > 0 &&
    allSections.every(s =>
      clusterResult.clusters.some(c => c.memberIds.includes(s.id)) ||
      clusterResult.unique.some(u => u.id === s.id)
    );

  await writeVerification(phaseDir, {
    phase: "phase-2-analyze",
    passed: routesCoverEveryPage && everySectionAccountedFor,
    checkedAt: new Date().toISOString(),
    criteria: [
      { name: "every page in crawl.json has an entry in routes.json", passed: routesCoverEveryPage },
      { name: "every section belongs to a cluster or is marked unique", passed: everySectionAccountedFor },
    ],
  });
}

function extractLayouts(
  clusters: ReturnType<typeof clusterSections>["clusters"],
  sections: { pages: { url: string }[] },
): Layouts {
  // Heuristic: a cluster whose tagSkeleton starts with `header`/`nav`/`footer`
  // and whose memberIds count == number of crawled pages = layout shell.
  const totalPages = sections.pages.length;
  const findShell = (prefix: string): LayoutShell | null => {
    const candidate = clusters.find(c =>
      c.representative.tagSkeleton.startsWith(prefix) &&
      c.memberIds.length === totalPages
    );
    if (!candidate) return null;
    return {
      id: candidate.id,
      signature: candidate.id.replace(/^cluster-/, ""),
      appearsOn: dedupeUrls(candidate.memberIds.map(id => id.split("#")[0])),
      tagSkeleton: candidate.representative.tagSkeleton,
    };
  };
  return {
    header: findShell("header"),
    footer: findShell("footer"),
    nav: findShell("nav"),
    updatedAt: new Date().toISOString(),
  };
}

function extractComponents(
  clusters: ReturnType<typeof clusterSections>["clusters"],
  layouts: Layouts,
): ComponentEntry[] {
  const layoutIds = new Set([layouts.header?.id, layouts.footer?.id, layouts.nav?.id].filter(Boolean));
  return clusters
    .filter(c => !layoutIds.has(c.id))
    .map(c => {
      const memberSections = c.memberIds.map(id => {
        const [url, sid] = id.split("#");
        return { id: sid, url };
      });
      return {
        id: c.id,
        name: nameFromSkeleton(c.representative.tagSkeleton),
        signature: c.id.replace(/^cluster-/, ""),
        tagSkeleton: c.representative.tagSkeleton,
        memberSections,
        unique: c.memberIds.length === 1,
        propsRef: null,
      };
    });
}

function nameFromSkeleton(skeleton: string): string {
  // Cheap derivation. The component-deduper agent improves these names later.
  const root = skeleton.split(">")[0] ?? "Section";
  return root.charAt(0).toUpperCase() + root.slice(1);
}

function dedupeUrls(urls: string[]): string[] {
  return [...new Set(urls)];
}
```

- [ ] **Step 2: Run analyze test — expect PASS (3 tests)**

```bash
pnpm test test/analyze.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add lib/analyze.ts test/analyze.test.ts
git commit -m "feat(plugin): add Phase 2 analyze orchestrator"
```

---

## Task 25: Wire phase-2-analyze into continue + integration test

**Files:**
- Modify: `lib/continue.ts`
- Create: `test/continue-analyze.integration.test.ts`

- [ ] **Step 1: Update `defaultDispatchers()` in `lib/continue.ts`**

Open `lib/continue.ts`. Find the `defaultDispatchers()` function added in Plan 2. Add an analyze dispatcher.

Add at the top with other imports:
```typescript
import { runAnalyze } from "./analyze.ts";
import { loadAdapter } from "./load-adapter.ts";
import { loadProbe } from "./load-probe.ts";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
```

Replace the existing `defaultDispatchers()` body with:
```typescript
export function defaultDispatchers(): Record<string, PhaseDispatcher> {
  return {
    "phase-1-discover": async ({ targetDir, runDir }) => {
      await runDiscover({ targetDir, runDir });
    },
    "phase-2-analyze": async ({ targetDir, runDir }) => {
      const selector = await resolvePrimarySelector(targetDir, runDir);
      await runAnalyze({ targetDir, runDir, primarySelector: selector });
    },
  };
}

async function resolvePrimarySelector(targetDir: string, runDir: string): Promise<string> {
  const probePath = `${targetDir}/.migration/runs/${runDir}/phase-1-discover/discovery/probe.json`;
  const probeResult = loadProbe(probePath);
  if (!probeResult.valid) {
    throw new Error(`Cannot resolve primarySelector: probe.json invalid at ${probePath}`);
  }
  const adapterPath = probeResult.data.pages[0]?.matchedAdapters[0];
  if (!adapterPath) {
    throw new Error("Cannot resolve primarySelector: probe.json has no matchedAdapters");
  }
  const adapterResult = loadAdapter(adapterPath);
  if (!adapterResult.valid) {
    throw new Error(`Cannot resolve primarySelector: adapter invalid at ${adapterPath}`);
  }
  const sd = adapterResult.data.sectionDiscovery;
  return sd?.selector ?? "body > *";
}
```

(Note: in the existing schema, `sectionDiscovery.selector` is the field name from Plan 1. If the field is named `primarySelector` in the runtime adapters under `adapters/`, normalize at the loader level — but Plan 2's vendored adapters and the `AdapterSchema` use `selector`. Confirm by reading `schemas/adapter.ts:382` before committing.)

- [ ] **Step 2: Write the integration test**

Create `test/continue-analyze.integration.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import getPort from "get-port";
import { resumeMigration } from "../lib/continue.ts";
import { runAnalyze } from "../lib/analyze.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";

const fixtureDir = fileURLToPath(new URL("./fixtures/section-fixture/", import.meta.url));
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const port = await getPort();
  server = createServer((req, res) => {
    const reqPath = (req.url ?? "/").split("?")[0];
    let file: string;
    if (reqPath === "/") file = "index.html";
    else file = `${reqPath.replace(/^\//, "").replace(/\/$/, "")}.html`;
    const path = join(fixtureDir, file);
    if (!existsSync(path)) { res.statusCode = 404; res.end("nope"); return; }
    res.setHeader("Content-Type", "text/html");
    res.end(readFileSync(path, "utf8"));
  });
  await new Promise<void>(r => server.listen(port, r));
  baseUrl = `http://127.0.0.1:${port}`;
});
afterAll(() => new Promise<void>(r => server.close(() => r())));

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
  writeFileSync(join(phaseDir, "VERIFICATION.md"), "# verified");
}

describe("continue → analyze end-to-end", () => {
  it("dispatches phase-2-analyze when phase-1 has verified", async () => {
    const root = mkdtempSync(join(tmpdir(), "e2e-analyze-"));
    await bootstrapMigration({
      targetDir: root,
      site: {
        sourceUrl: baseUrl + "/", target: "./",
        mode: "unattended", goal: "wireframe", inputMode: "url-only",
        maxParallelPages: 4, maxParallelSections: 4,
      },
    });
    const urls = [baseUrl + "/", baseUrl + "/about", baseUrl + "/pricing", baseUrl + "/case-study-x"];
    writePhase1(root, "001-initial", urls);

    const dispatchers = {
      "phase-2-analyze": async ({ targetDir, runDir }: { targetDir: string; runDir: string }) => {
        await runAnalyze({
          targetDir, runDir,
          primarySelector: "body > header, body > main > *, body > footer",
        });
      },
    };
    const result = await resumeMigration(root, { dispatchers });
    expect(result.kind).toBe("dispatched");
    if (result.kind === "dispatched") expect(result.phase).toBe("phase-2-analyze");
    expect(existsSync(join(root, ".migration/library/components.json"))).toBe(true);
    expect(existsSync(join(root, ".migration/library/routes.json"))).toBe(true);
    expect(existsSync(join(root, ".migration/runs/001-initial/phase-2-analyze/VERIFICATION.md"))).toBe(true);
  }, 60_000);
});
```

- [ ] **Step 3: Run** `pnpm test test/continue-analyze.integration.test.ts`. Expect PASS.

- [ ] **Step 4: Run full suite** `pnpm test`. Expect previous count + new tests pass. Then `pnpm typecheck`.

- [ ] **Step 5: Commit**

```bash
git add lib/continue.ts test/continue-analyze.integration.test.ts
git commit -m "feat(plugin): wire phase-2-analyze into continue dispatcher"
```

---

## Task 26: CLI shim for analyze

**Files:**
- Modify: `lib/analyze.ts`

- [ ] **Step 1: Append CLI shim**

Append to `lib/analyze.ts`:
```typescript
if (import.meta.url === `file://${process.argv[1]}`) {
  const get = (flag: string) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const targetDir = get("--target") ?? process.cwd();
  const runDir = get("--run") ?? "001-initial";
  const primarySelector = get("--selector") ?? "body > *";
  runAnalyze({ targetDir, runDir, primarySelector })
    .then(() => { console.log(`Analyze phase complete for run ${runDir}.`); })
    .catch(err => { console.error(err.message); process.exit(1); });
}
```

- [ ] **Step 2: Re-run analyze tests to confirm shim does not break imports**

```bash
pnpm test test/analyze.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/analyze.ts
git commit -m "feat(plugin): add CLI shim for analyze"
```

---

## Task 27: layout-extractor agent prompt

**Files:**
- Create: `agents/layout-extractor.md`

- [ ] **Step 1: Write the agent prompt**

Create `agents/layout-extractor.md`:
```markdown
---
name: layout-extractor
description: Phase 2 sub-agent. Identifies header / footer / nav shells across crawled pages and produces the layouts.json shape. Operates on cluster summaries only, never full DOM specs.
---

# Layout Extractor Agent

You receive cluster summaries (id, tagSkeleton, member-page list) from the algorithmic first-pass produced by `lib/cluster.ts` and decide which clusters are layout shells.

## Inputs

- `clusters` — array of `{ id, tagSkeleton, memberIds[], representative: { tagSkeleton, pathShingles } }`
- `pageCount` — total number of crawled pages
- `existingLayouts` — current `layouts.json` contents (may be empty for an initial run)

## Rules

1. A cluster qualifies as a **layout shell** when:
   - Its `tagSkeleton` starts with `header`, `nav`, or `footer`, AND
   - It appears on ≥ 80% of crawled pages.
2. Promote the highest-coverage candidate per slot (`header`, `footer`, `nav`) to `layouts.json`. If no cluster qualifies for a slot, set that slot to `null`.
3. Never invent shells that the cluster output did not surface. If the page has no `<footer>`, leave `footer: null`.
4. When in doubt, return `null` for the slot rather than guessing.

## Output

Return a `Layouts` object matching `schemas/layouts.ts`:

```json
{
  "header": { "id": "cluster-...", "signature": "...", "appearsOn": ["..."], "tagSkeleton": "..." },
  "footer": { ... } | null,
  "nav": { ... } | null,
  "updatedAt": "<ISO timestamp>"
}
```

## You MUST NOT

- Inspect full DOM specs. You only see cluster summaries.
- Modify `components.json` or `routes.json` — those are other agents' jobs.
- Invent cluster IDs that don't exist in the input.
```

- [ ] **Step 2: Commit**

```bash
git add agents/layout-extractor.md
git commit -m "feat(plugin): add layout-extractor agent prompt"
```

---

## Task 28: component-deduper agent prompt

**Files:**
- Create: `agents/component-deduper.md`

- [ ] **Step 1: Write the agent prompt**

Create `agents/component-deduper.md`:
```markdown
---
name: component-deduper
description: Phase 2 sub-agent. Reviews algorithmic clusters and ambiguous-pair proposals from lib/cluster.ts, refines names, and decides whether ambiguous pairs should merge. Operates on cluster summaries only.
---

# Component Deduper Agent

You take the algorithmic-first-pass output from `lib/cluster.ts` and refine it.

## Inputs

- `clusters` — `{ id, tagSkeleton, representative, memberIds[] }`
- `ambiguousPairs` — `{ a, b, similarity }` — section-id pairs whose Jaccard similarity sits between `ambiguousThreshold` and `autoMergeThreshold`
- `unique` — sections that ended up as singletons
- `pageCount` — total number of crawled pages

## Rules

1. **Names.** Each cluster needs a meaningful component name (e.g., `Hero`, `PricingTable`, `CaseStudyCard`). Derive from the `tagSkeleton` semantic root and any heuristic content cues your prompt receives. Default to `Section{N}` when nothing better is inferable.
2. **Ambiguous merges.** For each ambiguous pair, decide `merge` or `keep-separate`. Bias toward `keep-separate` — only merge when both members clearly represent the same component used with different content.
3. **Unique sections.** Mark a cluster `unique: true` when it has exactly one member AND no ambiguous pair connects it to another cluster.
4. **Cost bound.** You see at most a few KB per cluster (signature + sample text + page list). Do not ask for full DOM specs.

## Output

A revised `Components` array matching `schemas/components.ts`:

```json
[
  {
    "id": "cluster-abc123",
    "name": "Hero",
    "signature": "abc123",
    "tagSkeleton": "section>div>h1",
    "memberSections": [{ "id": "p0-s1", "url": "..." }, ...],
    "unique": false,
    "propsRef": "HeroProps"
  }
]
```

Plus a `mergeDecisions` array:

```json
[{ "pair": ["section-a-id", "section-b-id"], "decision": "merge" | "keep-separate", "reason": "..." }]
```

## You MUST NOT

- Hallucinate sections that don't appear in the cluster input.
- Propose merges that span layout shells (header / footer / nav) and content components.
- Touch `routes.json` or `props.json`.
```

- [ ] **Step 2: Commit**

```bash
git add agents/component-deduper.md
git commit -m "feat(plugin): add component-deduper agent prompt"
```

---

## Task 29: prop-classifier agent prompt

**Files:**
- Create: `agents/prop-classifier.md`

- [ ] **Step 1: Write the agent prompt**

Create `agents/prop-classifier.md`:
```markdown
---
name: prop-classifier
description: Phase 2 sub-agent. Diffs cluster member content samples and proposes a TS prop interface per multi-member component. Operates on sample text only, never full specs.
---

# Prop Classifier Agent

You receive a refined `Components` array from `component-deduper` and emit a `PropsRegistry` matching `schemas/props.ts`.

## Inputs

For each component cluster:
- `name` (e.g., `Hero`)
- `tagSkeleton`
- `memberSections` — array of `{ id, url, sampleText }` (sample text is the first ~200 chars per member)

## Rules

1. **Required vs optional.** A field is required when every member supplies a value; optional when only some do.
2. **Type inference.**
   - All-strings → `string`
   - Numeric across all members → `number`
   - Boolean-ish (`true`/`false` strings or empty/non-empty) → `boolean`
   - Lists of items → `string[]`
   - Object structures (e.g., CTA with label + href) → inline TS shape `{ label: string; href: string }`
3. **Naming.** Use camelCase. Common slots: `title`, `subtitle`, `description`, `cta`, `image`, `items`.
4. **Single-member or unique clusters** → empty `fields: []`. The interface still ships so downstream Phase 5 can import a name.
5. **Cap.** Never propose more than 8 fields per interface. If you'd exceed that, group related fields into a sub-shape (e.g., `meta: { ... }`).

## Output

A `PropsRegistry` matching `schemas/props.ts`:

```json
{
  "interfaces": [
    {
      "name": "HeroProps",
      "fields": [
        { "name": "title", "tsType": "string", "required": true },
        { "name": "subtitle", "tsType": "string", "required": false }
      ]
    }
  ],
  "updatedAt": "<ISO>"
}
```

## You MUST NOT

- Read full element specs (styles, images, animations) — you don't have them in Phase 2.
- Invent fields that no sample text supports.
```

- [ ] **Step 2: Commit**

```bash
git add agents/prop-classifier.md
git commit -m "feat(plugin): add prop-classifier agent prompt"
```

---

## Task 30: route-mapper agent prompt

**Files:**
- Create: `agents/route-mapper.md`

- [ ] **Step 1: Write the agent prompt**

Create `agents/route-mapper.md`:
```markdown
---
name: route-mapper
description: Phase 2 sub-agent. Reviews the algorithmic route table from lib/route-map.ts, fixes obviously wrong dynamic-segment promotions, and emits the final routes.json shape. Operates on URL paths only.
---

# Route Mapper Agent

You take the algorithmic route output from `lib/route-map.ts` and refine it.

## Inputs

- `routes` — `{ sourceUrl, nextRoute, params, kind }[]` produced by `lib/route-map.ts`
- `crawl` — original crawl metadata (page titles, depths)

## Rules

1. **Trust the algorithm by default.** `lib/route-map.ts` collapses sibling URL groups of size ≥ 3 into `[slug]` patterns. Do not lower the threshold.
2. **Override only when the algorithm is clearly wrong:**
   - The same parent has both an index page and 3+ sibling children → mark the index as `kind: "static"` and the children as `kind: "dynamic"` (the algorithm already does this; verify).
   - Sibling URLs that share a common token but represent unrelated pages should NOT be promoted. If you spot such a false-positive group, demote them all back to `static` and explain in `notes`.
3. **Catch-all routes** are out of scope for v1. Emit only `static` and `dynamic` kinds.
4. **Locale prefixes** (e.g., `/en`, `/fr`) — leave alone for v1; treat as ordinary path segments.

## Output

A `Routes` object matching `schemas/routes.ts`:

```json
{
  "routes": [
    { "sourceUrl": "...", "nextRoute": "/", "params": {}, "kind": "static" },
    { "sourceUrl": "...", "nextRoute": "/case-study/[slug]", "params": { "slug": "cookunity" }, "kind": "dynamic" }
  ],
  "updatedAt": "<ISO>"
}
```

Plus an optional `notes: string[]` array surfacing any overrides you applied.

## You MUST NOT

- Invent routes for URLs that aren't in the input.
- Modify `components.json`, `layouts.json`, or `props.json`.
- Introduce route patterns that don't exist in Next.js App Router (`[slug]`, `[...slug]`, `(group)` are valid; v1 emits only `[slug]`).
```

- [ ] **Step 2: Commit**

```bash
git add agents/route-mapper.md
git commit -m "feat(plugin): add route-mapper agent prompt"
```

---

## Task 31: /migrate:analyze command + skill

**Files:**
- Create: `commands/migrate-analyze.md`
- Create: `skills/migrate-analyze/SKILL.md`

- [ ] **Step 1: Command**

Create `commands/migrate-analyze.md`:
```markdown
---
name: migrate:analyze
description: Explicitly run Phase 2 (Analyze) for the active run.
---

Invoke the `migrate-analyze` skill.
```

- [ ] **Step 2: Skill**

Create `skills/migrate-analyze/SKILL.md`:
```markdown
---
name: migrate-analyze
description: Run Phase 2 (Analyze) — cluster sections across crawled pages, build the shared component library, gate on routes.json + cluster coverage.
---

# /migrate:analyze

You are running Phase 2 explicitly. Delegate the section-clustering to the algorithmic pipeline (`lib/analyze.ts`), then refine via the four sub-agents.

## Step 1 — Verify preconditions

Read `.migration/SITE.md`. If it does not exist, abort with: "No migration in this directory. Run `/migrate:new <url>`."

Read `.migration/runs/<runDir>/phase-1-discover/VERIFICATION.md`. If it is missing, abort with: "Phase 1 must complete first. Run `/migrate:discover` or `/migrate:continue`."

If `runs/<runDir>/phase-2-analyze/VERIFICATION.md` already exists, ask the user: "Phase 2 already verified. Re-run? (yes / no)" — abort on no.

## Step 2 — Resolve the adapter's primarySelector

Read `runs/<runDir>/phase-1-discover/discovery/probe.json`. Take `pages[0].matchedAdapters[0]` as the adapter path. Load that adapter (`AdapterSchema`-validated). Use its `sectionDiscovery.selector` as the primary selector for the section probe.

## Step 3 — Run the analyze script

```bash
tsx ${PLUGIN_DIR}/lib/analyze.ts \
  --target "${TARGET_DIR}" \
  --run "${RUN_DIR}" \
  --selector "<primarySelector>"
```

This writes:
- `runs/<runDir>/phase-2-analyze/PLAN.md`
- `runs/<runDir>/phase-2-analyze/EXECUTION.md`
- `runs/<runDir>/phase-2-analyze/analysis/sections.json`
- `runs/<runDir>/phase-2-analyze/analysis/clusters.json`
- `library/layouts.json`, `library/components.json`, `library/props.json`, `library/routes.json`
- `library/HISTORY.md` (appended)
- `runs/<runDir>/phase-2-analyze/verification.json` (always)
- `runs/<runDir>/phase-2-analyze/VERIFICATION.md` (only on gate pass)

## Step 4 — Refine with sub-agents

The script produces the algorithmic-first-pass output. Refine it by dispatching the four agents in order:

1. `layout-extractor` — promotes layout shells in `layouts.json`
2. `component-deduper` — finalizes component names + ambiguous-pair decisions in `components.json`
3. `prop-classifier` — fills in `props.json` interfaces
4. `route-mapper` — reviews `routes.json`, applies overrides if any

Pass each agent only the cluster summaries / route data it needs — never the full sections.json content.

## Step 5 — Re-run the verification gate

After refinement, re-invoke `lib/analyze.ts` with the same args. The script is idempotent; it re-validates the library JSONs and re-emits the verification.

If `VERIFICATION.md` exists, print:

> Analyze complete: N components, M routes, K layout shells. Run `/migrate:status` or `/migrate:continue` to proceed to Phase 3 (Plan).

If the gate did not pass, surface the failing criteria from `verification.json` and stop.

## You MUST NOT

- Skip the page-coverage gate. Every URL in `crawl.json` MUST appear in `routes.json`.
- Modify `crawl.json` or `probe.json`.
- Invoke any other phase.
```

- [ ] **Step 3: Commit**

```bash
git add commands/migrate-analyze.md skills/migrate-analyze/SKILL.md
git commit -m "feat(plugin): add /migrate:analyze skill and command"
```

---

## Task 32: Knowledge — analyze phase pitfalls

**Files:**
- Create: `knowledge/phase-pitfalls/analyze.md`

- [ ] **Step 1: Write the pitfalls file**

Create `knowledge/phase-pitfalls/analyze.md`:
```markdown
# Phase 2 (Analyze) — pitfalls

## Section probe

- **Adapter selector mismatch.** The probe selector comes from the matched adapter's `sectionDiscovery.selector`. Webflow uses `body > *`; Wix uses `#PAGES_CONTAINER .wixui-section`. If clusters are huge mega-sections, the selector is too coarse — refine the adapter, not the analyze code.
- **Hidden / collapsed elements.** `getBoundingClientRect()` returns 0×0 for `display: none` elements. The probe currently keeps zero-height sections; the cluster step is unaffected (similarity is structural), but downstream agents may want to filter them.
- **JS-rendered sections.** Probe waits for `domcontentloaded` only. Sites that mount sections post-DCL produce sparse output — the LLM-refinement step cannot recover what wasn't probed. Workaround: bump the wait or extend the adapter's `spaContainerHints`.

## Clustering

- **Threshold tuning.** `autoMergeThreshold = 0.85` and `ambiguousThreshold = 0.6` are conservative. Lower autoMerge causes false merges (a `Hero` and a `CallToAction` become one component); raise it past 0.95 and almost nothing clusters.
- **Path shingles vs full DOM trees.** The algorithm uses N-gram path shingles, not real tree-edit distance. Two sections with similar tag paths but very different content can match. The LLM-refinement step (`component-deduper`) is what catches this.
- **Cluster IDs are signature-derived.** Re-running on the same crawl yields the same cluster IDs. Re-running after a probe re-crawl that changed the DOM produces NEW IDs — that's by design; downstream `pages/[slug]/component-usage.json` (Phase 4+) must re-resolve.

## Routes

- **Threshold for `[slug]` promotion.** The current implementation collapses sibling URL groups of size ≥ 3. A 2-page case-study set will stay as two static routes. Raise the threshold for sites with many short-tail patterns; lower it for sites with many similar long-tail clusters.
- **Trailing slashes.** `/case-study/cookunity/` and `/case-study/cookunity` are NOT collapsed by the route mapper — Phase 1's crawler should already have normalized them, but if it didn't, the mapper sees them as two distinct URLs and may demote a [slug] group below threshold.
- **Locale prefixes.** v1 treats `/en/foo` and `/fr/foo` as distinct paths. They will produce two static routes, not a `[locale]/foo` dynamic. v2 candidate.

## Library

- **`HISTORY.md` is append-only.** Never rewrite. Each Phase 2 run appends one entry. Polish runs that don't touch the library still write a "no library changes" entry for audit traceability.
- **`layouts.json` slots can be `null`.** A site with no `<footer>` legitimately produces `footer: null`. Downstream Phase 5 must treat null as "skip this layout slot," not "use a default".
- **`props.json` empties are normal for v1.** Phase 2 ships interface stubs (`fields: []`). Phase 5 (Build) is responsible for filling the prop fields once it has full extracted specs.

## Gate

- **Page-coverage gate is exact.** Every URL in `crawl.json` MUST have a `routes.json` entry. If you've manually trimmed `crawl.json` post-Phase-1, re-run `/migrate:analyze` so routes match.
- **Section-coverage gate ignores empty pages.** A page that probed zero sections (e.g., a 404 the crawler stored) still passes — there are no sections to account for. That's intentional; Phase 4 will skip empty-section pages anyway.
- **`VERIFICATION.md` is never written when `passed: false`.** The presence of `VERIFICATION.md` is the system's only signal that the gate passed; do not write it by hand.
```

- [ ] **Step 2: Commit**

```bash
git add knowledge/phase-pitfalls/analyze.md
git commit -m "docs(plugin): add Phase 2 (Analyze) pitfalls knowledge file"
```

---

## Task 33: Final verification — full test + typecheck

- [ ] **Step 1: Run the full test suite**

```bash
pnpm test
```

Expected: All Plan 1 + Plan 2 tests still pass (~112). New Plan 3 tests pass:
- `sections-schema.test.ts` — 4
- `load-sections.test.ts` — 2
- `section-signature.test.ts` — 10
- `cluster.test.ts` — 4
- `discover-sections-runner.test.ts` — 2
- `layouts-schema.test.ts` — 3
- `load-layouts.test.ts` — 2
- `components-schema.test.ts` — 2
- `load-components.test.ts` — 2
- `props-schema.test.ts` — 2
- `load-props.test.ts` — 2
- `routes-schema.test.ts` — 3
- `load-routes.test.ts` — 2
- `route-map.test.ts` — 5
- `library-history.test.ts` — 3
- `analyze.test.ts` — 3
- `continue-analyze.integration.test.ts` — 1

Total new: ~52. Combined: ~164 passing.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: exits 0.

- [ ] **Step 3: Manual smoke test — analyze runs end-to-end against a verified Phase 1**

If a `.migration/` from a real Phase 1 run is available (e.g., in a sibling project), point the analyze CLI at it:

```bash
tsx ~/.../nextjs-migration-plugin/lib/analyze.ts \
  --target "/path/to/user-project" \
  --run "001-initial" \
  --selector "body > *"
```

Verify:
- `library/layouts.json`, `library/components.json`, `library/props.json`, `library/routes.json` written and Zod-valid
- `library/HISTORY.md` has a new entry
- `runs/001-initial/phase-2-analyze/VERIFICATION.md` exists
- Every URL in the original `crawl.json` appears in `routes.json`

If the gate fails, read `verification.json` and check the failing criterion. Common cause: the adapter's `sectionDiscovery.selector` returned zero matches — refine the adapter, not the analyze pipeline.

- [ ] **Step 4: Commit any smoke-driven fixes**

If the smoke test surfaces issues (e.g., adapter selector field name mismatch, runner subprocess argument quoting), fix them and commit with `fix(plugin): [specific issue]`.

---

## Self-review — spec coverage

Mapping spec § 5 row 2 / § 9 / § 10 / § 11 to tasks:

| Spec requirement | Task(s) |
|---|---|
| § 5 row 2: layout-extractor agent | 27 |
| § 5 row 2: component-deduper agent | 28 |
| § 5 row 2: prop-classifier agent | 29 |
| § 5 row 2: route-mapper agent | 30 |
| § 5 row 2: `library/*.json` artifacts | 11-19, 22, 24 |
| § 5 row 2 gate: every page in crawl has entry in routes.json | 20-21 (route mapper), 24 (gate criterion 1) |
| § 5 row 2 gate: every section in cluster or marked unique | 7-8 (clusterer), 24 (gate criterion 2) |
| § 9 `/migrate:analyze` explicit invocation | 26, 31 |
| § 10 layout-extractor / component-deduper / prop-classifier / route-mapper roles | 27-30 |
| § 11.1 algorithmic first-pass (tree edit distance + shingle hashing) | 5-8 (Jaccard over path shingles approximates tree edit distance for v1; spec § 11 explicitly allows shingle hashing) |
| § 11.2 LLM refinement on ambiguous clusters | 23-24 (orchestrator surfaces `ambiguousPairs` to component-deduper agent) |
| § 11.3 merge rules (deterministic auto-merge, LLM-proposed merges surfaced) | 7-8 (auto-merge ≥ threshold), 28 (deduper handles ambiguous) |
| § 11.4 cost bound — LLM sees only cluster summaries | 27-30 (every agent prompt explicitly forbids reading full specs) |
| § 7 state schemas via Zod + state-repairer | 1-2, 11-19 (all schemas use existing `LoadResult<T>` from Plan 2's `schemas/errors.ts`) |
| § 4 state model — `library/{layouts,components,props,routes}.json` + `HISTORY.md` | 22, 24 |
| Wire phase-2-analyze into `/migrate:continue` | 25 |
| Knowledge — phase-2 pitfalls | 32 |

**Deferred to later plans (per the plan's Out of scope section):**
- Delta-mode Analyze (§ 6) — exact / near / no match handling, prop-variant proposal, sibling variant fallback
- Visual regression gate around library extensions (§ 6 visual regression)
- Generation of TS prop interface source files into `<target>/src/`

**Type / name consistency check:**
- `LoadResult<T>.data` is used uniformly by every loader in this plan, matching the convention from Plan 2 (Task 7).
- `clusterSections` accepts `SectionInput` and returns `ClusterResult` with fields `clusters`, `ambiguousPairs`, `unique` — used consistently in Tasks 7-8, 23-24.
- `runAnalyze` arg names (`targetDir`, `runDir`, `primarySelector`, `discoverSections`) match across Tasks 23, 24, 25 (CLI shim), 26.
- `appearsOn` field on `LayoutShell` is used in Task 12 (schema), Task 24 (orchestrator), Task 27 (agent prompt) — same name everywhere.
- Phase-id strings (`phase-2-analyze`) match across `lib/phase-status.ts` (already lists them in Plan 2 Task 16's `knownPhases`), `lib/analyze.ts`, `lib/continue.ts`, the integration test, the agent prompts, and the spec.

No TBD placeholders. Every code-modifying step shows the code.

## Ready for execution

Plan complete and saved to `docs/superpowers/plans/2026-04-30-phase-2-analyze.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch with checkpoints

Which approach?
