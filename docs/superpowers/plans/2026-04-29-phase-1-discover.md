# Phase 1 Discover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement runtime Phase 1 (Discover) end-to-end so that, in a freshly-bootstrapped repo, `/migrate:new <url>` followed by `/migrate:continue` (or the explicit `/migrate:discover`) crawls the source URL, probes every discovered page against the adapter registry, writes Zod-validated `discovery/crawl.json` + `discovery/probe.json` under `runs/001-initial/phase-1-discover/`, and emits a `VERIFICATION.md` only after the gate from spec § 5 passes (page list confirmed; every page has either a matched adapter or an explicit `ABORT_NO_ADAPTER`).

**Architecture:** A new TypeScript script `scripts/crawl-site.ts` does the actual Playwright-driven crawl. Lib-level drivers (`lib/crawl-runner.ts`, `lib/probe-runner.ts`) shell out to that script and to the existing `scripts/probe-page.ts`, then aggregate results. A `lib/discover.ts` orchestrator wires the two together, validates against new Zod schemas (`schemas/crawl.ts`, `schemas/probe.ts`), and writes the standard phase artifacts (`PLAN.md` / `EXECUTION.md` / `VERIFICATION.md`) via a small `lib/phase-state.ts` helper. A `lib/continue.ts` resume function, mirrored by the `/migrate:continue` skill, scans the active run for the first phase missing `VERIFICATION.md` and dispatches its skill. State-file auto-repair generalizes Plan 1's adapter-specific wrapper into `lib/load-with-repair.ts` so crawl/probe JSON can be repaired the same way adapters are.

**Tech Stack:** TypeScript, Zod, Vitest, Node ≥22, pnpm, Playwright (newly added). Markdown for skills/agents. Shell-invokable scripts via `tsx`.

**Execution context:** All paths are relative to `nextjs-migration-plugin/` repo root. The previous plan tagged `v0.0.1`; this plan ends at `v0.0.2`. Some tasks rely on a small in-process HTTP fixture server in tests — no external network access required for the test suite.

**Spec source:** `docs/superpowers/specs/2026-04-21-migration-plugin-design.md` § 5 (Phase 1) and § 9 (`/migrate:continue`, `/migrate:discover`, `/migrate:verify`).

**Predecessor:** `docs/superpowers/plans/2026-04-21-plugin-foundation.md` (executed, tagged `v0.0.1`).

---

## File structure (what this plan produces)

```
nextjs-migration-plugin/
├── package.json                                # +@playwright/test, +get-port (dev)
├── schemas/
│   ├── crawl.ts                                # NEW — CrawlSchema, CrawledPageSchema
│   ├── probe.ts                                # NEW — ProbeSchema, ProbedPageSchema
│   └── phase.ts                                # NEW — PhaseVerificationSchema (gate result shape)
├── lib/
│   ├── load-crawl.ts                           # NEW — Zod loader (diagnostic return)
│   ├── load-probe.ts                           # NEW — Zod loader (diagnostic return)
│   ├── load-with-repair.ts                     # NEW — generic repair wrapper
│   ├── load-adapter-with-repair.ts             # MODIFIED — re-exports via generic wrapper
│   ├── slug.ts                                 # NEW — URL → slug helper
│   ├── phase-state.ts                          # NEW — read/write PLAN/EXECUTION/VERIFICATION.md
│   ├── phase-status.ts                         # NEW — first-incomplete-phase scanner
│   ├── continue.ts                             # NEW — /migrate:continue resume logic
│   ├── crawl-runner.ts                         # NEW — invokes scripts/crawl-site.ts
│   ├── probe-runner.ts                         # NEW — invokes scripts/probe-page.ts per URL
│   └── discover.ts                             # NEW — phase 1 driver
├── scripts/
│   └── crawl-site.ts                           # NEW — Playwright crawler, robots.txt-aware
├── commands/
│   ├── migrate-continue.md                     # NEW
│   ├── migrate-discover.md                     # NEW
│   └── migrate-verify.md                       # NEW
├── skills/
│   ├── migrate-continue/SKILL.md               # NEW
│   └── migrate-discover/SKILL.md               # NEW
├── agents/
│   ├── site-crawler.md                         # NEW
│   ├── state-repairer.md                       # NEW
│   ├── phase-executor.md                       # NEW
│   └── phase-verifier.md                       # NEW
├── knowledge/phase-pitfalls/
│   └── discover.md                             # NEW
└── test/
    ├── crawl-schema.test.ts                    # NEW
    ├── load-crawl.test.ts                      # NEW
    ├── probe-schema.test.ts                    # NEW
    ├── load-probe.test.ts                      # NEW
    ├── load-with-repair.test.ts                # NEW (generic)
    ├── load-adapter-with-repair.test.ts        # UNCHANGED (still green)
    ├── slug.test.ts                            # NEW
    ├── phase-state.test.ts                     # NEW
    ├── phase-status.test.ts                    # NEW
    ├── continue.test.ts                        # NEW
    ├── crawl-runner.test.ts                    # NEW (in-process HTTP fixture)
    ├── probe-runner.test.ts                    # NEW (mocked subprocess)
    ├── discover.test.ts                        # NEW (integration: bootstrap → discover → verify)
    ├── crawl-site.script.test.ts               # NEW (smoke against in-process server)
    └── fixtures/
        ├── crawl-valid.json                    # NEW
        ├── crawl-invalid.json                  # NEW
        ├── probe-valid.json                    # NEW
        ├── probe-invalid.json                  # NEW
        ├── site-fixture/                       # NEW — small HTML pages served in-process
        │   ├── index.html
        │   ├── about.html
        │   ├── pricing.html
        │   └── robots.txt
        └── probe-output/                       # NEW — sample probe-page.ts JSON outputs
            ├── webflow.json
            └── unmatched.json
```

Each lib file has a single responsibility. Schemas define data shape. Loaders parse+validate+return diagnostics. Runners shell out to scripts. The discover driver orchestrates. The continue function is the only piece that knows about phase ordering. Skills/agents are thin LLM-facing markdown.

---

## Conventions used in this plan

- Script invocation in lib code is via `node:child_process` `execFile` with `tsx <plugin-root>/scripts/<name>.ts <args>`. Tests inject the `tsx` binary path so they can swap it for a stub when desired.
- All artifact paths under a run are relative to the run dir. The discover phase writes:
  ```
  runs/001-initial/phase-1-discover/
  ├── PLAN.md
  ├── EXECUTION.md
  ├── VERIFICATION.md           # only on gate pass
  └── discovery/
      ├── crawl.json
      └── probe.json
  ```
- "Verified" means: both JSON files validate against their Zod schemas AND the gate criteria are satisfied AND `VERIFICATION.md` was written.
- "First incomplete phase" = the lowest-numbered `phase-N-*` directory under the active run that lacks `VERIFICATION.md`.

---

## Task 1: Add Playwright + test utilities to the toolchain

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml` (regenerated)

- [ ] **Step 1: Install dependencies**

```bash
pnpm add -D @playwright/test get-port
pnpm exec playwright install chromium
```

`@playwright/test` is the runtime used by `scripts/probe-page.ts` (and the new `scripts/crawl-site.ts`). `get-port` is a tiny dev helper used by tests that spin up an in-process HTTP server on a random free port.

- [ ] **Step 2: Verify install**

```bash
pnpm test
```

Expected: existing tests still pass (the new dep should not break anything).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(plugin): add Playwright and get-port for Phase 1 crawler"
```

---

## Task 2: URL → slug helper — failing test

**Files:**
- Create: `test/slug.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/slug.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { urlToSlug } from "../lib/slug.ts";

describe("urlToSlug", () => {
  it("returns 'home' for the root path", () => {
    expect(urlToSlug("https://example.com/")).toBe("home");
    expect(urlToSlug("https://example.com")).toBe("home");
  });

  it("uses the last path segment for single-segment URLs", () => {
    expect(urlToSlug("https://example.com/about")).toBe("about");
    expect(urlToSlug("https://example.com/about/")).toBe("about");
  });

  it("joins multi-segment paths with hyphens", () => {
    expect(urlToSlug("https://example.com/blog/intro-post")).toBe("blog-intro-post");
  });

  it("strips query strings and fragments", () => {
    expect(urlToSlug("https://example.com/x?ref=foo#bar")).toBe("x");
  });

  it("lowercases and removes non-url-safe characters", () => {
    expect(urlToSlug("https://example.com/About Us!")).toBe("about-us");
  });

  it("normalizes a path of only slashes to 'home'", () => {
    expect(urlToSlug("https://example.com//")).toBe("home");
  });

  it("lowercases across all path segments", () => {
    expect(urlToSlug("https://example.com/Foo/BAR/baz")).toBe("foo-bar-baz");
  });

  it("decodes percent-encoded spaces before stripping", () => {
    expect(urlToSlug("https://example.com/foo%20bar")).toBe("foo-bar");
  });

  it("degrades on malformed percent-encoding without throwing", () => {
    let result: string;
    expect(() => {
      result = urlToSlug("https://example.com/foo%XX");
    }).not.toThrow();
    expect(result!).not.toBe("");
    expect(result!.startsWith("foo")).toBe(true);
  });

  it("falls back to 'page' for non-ASCII-only paths", () => {
    expect(urlToSlug("https://example.com/中文")).toBe("page");
  });

  it("strips diacritics via NFKD normalization", () => {
    expect(urlToSlug("https://example.com/café")).toBe("cafe");
  });

  it("throws TypeError on a non-URL string", () => {
    expect(() => urlToSlug("not a url")).toThrow(TypeError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test test/slug.test.ts
```

Expected: FAIL with `Cannot find module '../lib/slug.ts'` (12 cases).

---

## Task 3: URL → slug helper — implementation

**Files:**
- Create: `lib/slug.ts`

- [ ] **Step 1: Implement**

Create `lib/slug.ts`:
```typescript
export function urlToSlug(url: string): string {
  const parsed = new URL(url);
  // decodeURIComponent: `new URL("https://x/About Us!").pathname` is
  // `/About%20Us!`. Without decoding, `%20` survives the [^a-z0-9/] strip
  // as digits `20`, producing `about-20us` instead of `about-us`.
  let decoded: string;
  try {
    decoded = decodeURIComponent(parsed.pathname);
  } catch {
    // Malformed percent-encoding (e.g. `%XX`) — degrade by feeding the still-
    // encoded pathname to the strip pipeline rather than throwing URIError.
    decoded = parsed.pathname;
  }
  // NFKD + combining-diacritic strip lets non-ASCII paths like `/café`
  // produce `cafe` instead of being wiped to empty by the ASCII filter.
  const normalized = decoded.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const path = normalized.replace(/^\/+|\/+$/g, "");
  if (path === "") return "home";
  const slug = path
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, "-")
    .replace(/\/+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  // Non-ASCII-only paths (e.g. `/中文`) leave nothing behind after the strip.
  // Fall back to a stable placeholder so the `.migration/pages/[slug]/`
  // directory contract never breaks.
  return slug === "" ? "page" : slug;
}
```

- [ ] **Step 2: Run test**

```bash
pnpm test test/slug.test.ts
```

Expected: PASS (12 tests).

- [ ] **Step 3: Commit**

```bash
git add lib/slug.ts test/slug.test.ts
git commit -m "feat(plugin): add URL-to-slug helper"
```

---

## Task 4: Crawl schema — failing test

**Files:**
- Create: `test/fixtures/crawl-valid.json`
- Create: `test/fixtures/crawl-invalid.json`
- Create: `test/crawl-schema.test.ts`

- [ ] **Step 1: Create fixtures**

Create `test/fixtures/crawl-valid.json`:
```json
{
  "sourceUrl": "https://example.com",
  "crawledAt": "2026-04-29T12:00:00.000Z",
  "limits": { "maxPages": 50, "maxDepth": 3 },
  "robotsTxt": { "fetched": true, "disallowedPaths": ["/admin"] },
  "sitemapUrls": ["https://example.com/sitemap.xml"],
  "pages": [
    {
      "url": "https://example.com/",
      "slug": "home",
      "title": "Example",
      "depth": 0,
      "discoveredVia": "seed",
      "status": 200,
      "outboundLinks": ["https://example.com/about"]
    },
    {
      "url": "https://example.com/about",
      "slug": "about",
      "title": "About",
      "depth": 1,
      "discoveredVia": "link",
      "status": 200,
      "outboundLinks": []
    }
  ],
  "errors": []
}
```

Create `test/fixtures/crawl-invalid.json`:
```json
{
  "sourceUrl": "not-a-url",
  "crawledAt": "yesterday",
  "limits": { "maxPages": -1 },
  "pages": [
    { "url": "https://example.com/", "depth": "zero" }
  ]
}
```

- [ ] **Step 2: Write the failing schema test**

Create `test/crawl-schema.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CrawlSchema } from "../schemas/crawl.ts";

const readFixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("CrawlSchema", () => {
  it("accepts a valid crawl", () => {
    const result = CrawlSchema.safeParse(readFixture("crawl-valid.json"));
    expect(result.success).toBe(true);
  });

  it("rejects a non-URL sourceUrl", () => {
    const result = CrawlSchema.safeParse(readFixture("crawl-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("sourceUrl"))).toBe(true);
    }
  });

  it("rejects a non-ISO crawledAt", () => {
    const result = CrawlSchema.safeParse(readFixture("crawl-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("crawledAt"))).toBe(true);
    }
  });

  it("rejects negative maxPages", () => {
    const result = CrawlSchema.safeParse(readFixture("crawl-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.join(".") === "limits.maxPages")).toBe(true);
    }
  });

  it("rejects a page with a non-numeric depth", () => {
    const result = CrawlSchema.safeParse(readFixture("crawl-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.join(".") === "pages.0.depth")).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run — expect fail**

```bash
pnpm test test/crawl-schema.test.ts
```

Expected: FAIL with `Cannot find module '../schemas/crawl.ts'`.

---

## Task 5: Crawl schema — implementation

**Files:**
- Create: `schemas/crawl.ts`

- [ ] **Step 1: Implement**

Create `schemas/crawl.ts`:
```typescript
import { z } from "zod";

export const CrawledPageSchema = z.object({
  url: z.string().url(),
  slug: z.string().min(1),
  title: z.string(),
  depth: z.number().int().nonnegative(),
  discoveredVia: z.enum(["seed", "sitemap", "link"]),
  status: z.number().int(),
  outboundLinks: z.array(z.string().url()).default([]),
});

export const CrawlErrorSchema = z.object({
  url: z.string(),
  reason: z.string(),
});

export const CrawlSchema = z.object({
  sourceUrl: z.string().url(),
  crawledAt: z.string().datetime(),
  limits: z.object({
    maxPages: z.number().int().positive(),
    maxDepth: z.number().int().nonnegative(),
  }),
  robotsTxt: z.object({
    fetched: z.boolean(),
    disallowedPaths: z.array(z.string()).default([]),
  }).optional(),
  sitemapUrls: z.array(z.string().url()).default([]),
  pages: z.array(CrawledPageSchema).min(1),
  errors: z.array(CrawlErrorSchema).default([]),
});

export type Crawl = z.infer<typeof CrawlSchema>;
export type CrawledPage = z.infer<typeof CrawledPageSchema>;
```

- [ ] **Step 2: Run test**

```bash
pnpm test test/crawl-schema.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 3: Commit**

```bash
git add schemas/crawl.ts test/crawl-schema.test.ts test/fixtures/crawl-valid.json test/fixtures/crawl-invalid.json
git commit -m "feat(plugin): add Zod crawl schema"
```

---

## Task 6: Crawl loader — failing test

**Files:**
- Create: `test/load-crawl.test.ts`

- [ ] **Step 1: Write failing test**

Create `test/load-crawl.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadCrawl } from "../lib/load-crawl.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadCrawl", () => {
  it("returns { valid: true } for a valid crawl.json", () => {
    const result = loadCrawl(fixturePath("crawl-valid.json"));
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data.pages).toHaveLength(2);
    }
  });

  it("returns { valid: false, issues, rawJson, path } for an invalid crawl.json", () => {
    const path = fixturePath("crawl-invalid.json");
    const result = loadCrawl(path);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.path).toBe(path);
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run — expect fail**

Expected: `Cannot find module '../lib/load-crawl.ts'`.

---

## Task 7: Crawl loader — implementation

**Files:**
- Create: `lib/load-crawl.ts`
- Modify: `schemas/errors.ts` (generalize the LoadResult type)

- [ ] **Step 1: Generalize the loader result type**

The Plan 1 `LoadResult<T>` uses an `adapter` field on the success branch. That was Plan 1's mistake — the field should not be adapter-specific. Replace `schemas/errors.ts`:
```typescript
import type { z } from "zod";

export type LoadResult<T> =
  | { valid: true; data: T }
  | { valid: false; issues: z.ZodIssue[]; rawJson: unknown; path: string };
```

This is a breaking rename for `lib/load-adapter.ts` and `lib/load-adapter-with-repair.ts`. Update both:

In `lib/load-adapter.ts`, change the success-branch return from `{ valid: true, adapter: result.data }` to `{ valid: true, data: result.data }`.

In `lib/load-adapter-with-repair.ts`, change `if (result.valid) return result.adapter;` to `if (result.valid) return result.data;` (in both occurrences).

In `test/load-adapter.test.ts`, update the assertion `result.adapter.name` → `result.data.name`.

In `test/load-adapter-with-repair.test.ts`, no change needed (it asserts the unwrapped `Adapter`, not the wrapper).

- [ ] **Step 2: Implement loadCrawl**

Create `lib/load-crawl.ts`:
```typescript
import { readFileSync } from "node:fs";
import { CrawlSchema, type Crawl } from "../schemas/crawl.ts";
import type { LoadResult } from "../schemas/errors.ts";

export function loadCrawl(path: string): LoadResult<Crawl> {
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
  const result = CrawlSchema.safeParse(rawJson);
  if (result.success) return { valid: true, data: result.data };
  return { valid: false, path, rawJson, issues: result.error.issues };
}
```

- [ ] **Step 3: Run all loader tests**

```bash
pnpm test test/load-crawl.test.ts test/load-adapter.test.ts test/load-adapter-with-repair.test.ts
```

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add lib/load-crawl.ts lib/load-adapter.ts lib/load-adapter-with-repair.ts schemas/errors.ts test/load-crawl.test.ts test/load-adapter.test.ts
git commit -m "feat(plugin): add crawl loader, generalize LoadResult"
```

---

## Task 8: Probe schema — failing test

**Files:**
- Create: `test/fixtures/probe-valid.json`
- Create: `test/fixtures/probe-invalid.json`
- Create: `test/probe-schema.test.ts`

- [ ] **Step 1: Create fixtures**

Create `test/fixtures/probe-valid.json`:
```json
{
  "probedAt": "2026-04-29T12:01:00.000Z",
  "pages": [
    {
      "url": "https://example.com/",
      "matchedAdapters": ["webflow"],
      "recommendation": "DIRECT_EXTRACTION",
      "detectedCMP": null,
      "isSPA": false
    },
    {
      "url": "https://example.com/spa",
      "matchedAdapters": [],
      "recommendation": "ABORT_NO_ADAPTER",
      "detectedCMP": "OneTrust",
      "isSPA": true
    }
  ]
}
```

Create `test/fixtures/probe-invalid.json`:
```json
{
  "probedAt": "today",
  "pages": [
    { "url": "https://example.com/", "recommendation": "EXTRACT_THIS_PAGE" }
  ]
}
```

- [ ] **Step 2: Write failing test**

Create `test/probe-schema.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ProbeSchema } from "../schemas/probe.ts";

const readFixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("ProbeSchema", () => {
  it("accepts a valid probe", () => {
    expect(ProbeSchema.safeParse(readFixture("probe-valid.json")).success).toBe(true);
  });

  it("rejects an invalid recommendation enum value", () => {
    const result = ProbeSchema.safeParse(readFixture("probe-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.join(".") === "pages.0.recommendation")).toBe(true);
    }
  });

  it("rejects a non-ISO probedAt", () => {
    const result = ProbeSchema.safeParse(readFixture("probe-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("probedAt"))).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run — expect fail**

Expected: module-not-found.

---

## Task 9: Probe schema — implementation

**Files:**
- Create: `schemas/probe.ts`

- [ ] **Step 1: Implement**

Create `schemas/probe.ts`:
```typescript
import { z } from "zod";

export const ProbeRecommendation = z.enum([
  "DIRECT_EXTRACTION",
  "SPA_FLOW_EXTRACTION",
  "ABORT_NO_ADAPTER",
]);

export const ProbedPageSchema = z.object({
  url: z.string().url(),
  matchedAdapters: z.array(z.string()).default([]),
  recommendation: ProbeRecommendation,
  detectedCMP: z.string().nullable().default(null),
  isSPA: z.boolean(),
});

export const ProbeSchema = z.object({
  probedAt: z.string().datetime(),
  pages: z.array(ProbedPageSchema).min(1),
});

export type Probe = z.infer<typeof ProbeSchema>;
export type ProbedPage = z.infer<typeof ProbedPageSchema>;
```

- [ ] **Step 2: Run test**

Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add schemas/probe.ts test/probe-schema.test.ts test/fixtures/probe-valid.json test/fixtures/probe-invalid.json
git commit -m "feat(plugin): add Zod probe schema"
```

---

## Task 10: Probe loader — failing test + implementation

**Files:**
- Create: `test/load-probe.test.ts`
- Create: `lib/load-probe.ts`

- [ ] **Step 1: Write failing test**

Create `test/load-probe.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadProbe } from "../lib/load-probe.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadProbe", () => {
  it("returns { valid: true } for a valid probe.json", () => {
    const result = loadProbe(fixturePath("probe-valid.json"));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.pages).toHaveLength(2);
  });

  it("returns { valid: false, issues } for an invalid probe.json", () => {
    const result = loadProbe(fixturePath("probe-invalid.json"));
    expect(result.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Expected: module-not-found.

- [ ] **Step 3: Implement loader**

Create `lib/load-probe.ts`:
```typescript
import { readFileSync } from "node:fs";
import { ProbeSchema, type Probe } from "../schemas/probe.ts";
import type { LoadResult } from "../schemas/errors.ts";

export function loadProbe(path: string): LoadResult<Probe> {
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
  const result = ProbeSchema.safeParse(rawJson);
  if (result.success) return { valid: true, data: result.data };
  return { valid: false, path, rawJson, issues: result.error.issues };
}
```

- [ ] **Step 4: Run test**

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/load-probe.ts test/load-probe.test.ts
git commit -m "feat(plugin): add probe loader"
```

---

## Task 11: Generic load-with-repair wrapper — failing test

**Files:**
- Create: `test/load-with-repair.test.ts`

- [ ] **Step 1: Write failing test**

Create `test/load-with-repair.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { loadWithRepair, UnrepairableStateError } from "../lib/load-with-repair.ts";
import type { LoadResult } from "../schemas/errors.ts";

const Schema = z.object({ name: z.string(), count: z.number() });
type T = z.infer<typeof Schema>;

function tempFile(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "load-repair-"));
  const path = join(dir, "data.json");
  writeFileSync(path, contents);
  return path;
}

function loaderFor(path: string): LoadResult<T> {
  // mirror of the real loader pattern
  const { readFileSync } = require("node:fs");
  let rawJson: unknown;
  try { rawJson = JSON.parse(readFileSync(path, "utf8")); }
  catch (err) {
    return { valid: false, path, rawJson: null,
      issues: [{ code: "custom", path: [], message: String(err) }] };
  }
  const r = Schema.safeParse(rawJson);
  return r.success
    ? { valid: true, data: r.data }
    : { valid: false, path, rawJson, issues: r.error.issues };
}

describe("loadWithRepair", () => {
  it("returns data on first valid load — no dispatch", async () => {
    const path = tempFile(JSON.stringify({ name: "ok", count: 1 }));
    const dispatch = vi.fn();
    const data = await loadWithRepair({ path, load: () => loaderFor(path), dispatch });
    expect(data.name).toBe("ok");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("dispatches up to maxAttempts and returns data after a successful repair", async () => {
    const path = tempFile(JSON.stringify({ name: "missing-count" }));
    const dispatch = vi.fn().mockImplementation(async () => {
      writeFileSync(path, JSON.stringify({ name: "fixed", count: 9 }));
    });
    const data = await loadWithRepair({ path, load: () => loaderFor(path), dispatch });
    expect(data.name).toBe("fixed");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("throws UnrepairableStateError after maxAttempts (default 3)", async () => {
    const path = tempFile(JSON.stringify({}));
    const dispatch = vi.fn().mockImplementation(async () => { /* no-op */ });
    await expect(
      loadWithRepair({ path, load: () => loaderFor(path), dispatch })
    ).rejects.toBeInstanceOf(UnrepairableStateError);
    expect(dispatch).toHaveBeenCalledTimes(3);
  });

  it("respects a custom maxAttempts of 1", async () => {
    const path = tempFile(JSON.stringify({}));
    const dispatch = vi.fn().mockImplementation(async () => { /* no-op */ });
    await expect(
      loadWithRepair({ path, load: () => loaderFor(path), dispatch, maxAttempts: 1 })
    ).rejects.toBeInstanceOf(UnrepairableStateError);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Expected: module-not-found.

---

## Task 12: Generic load-with-repair wrapper — implementation

**Files:**
- Create: `lib/load-with-repair.ts`
- Modify: `lib/load-adapter-with-repair.ts` (delegate to the generic)

- [ ] **Step 1: Implement the generic wrapper**

Create `lib/load-with-repair.ts`:
```typescript
import type { LoadResult } from "../schemas/errors.ts";

export class UnrepairableStateError extends Error {
  constructor(public lastResult: Extract<LoadResult<unknown>, { valid: false }>) {
    super(`State at ${lastResult.path} could not be auto-repaired.`);
    this.name = "UnrepairableStateError";
  }
}

export type RepairDispatcher<T> = (
  diagnostic: Extract<LoadResult<T>, { valid: false }>,
) => Promise<void>;

export interface LoadWithRepairArgs<T> {
  path: string;
  load: () => LoadResult<T>;
  dispatch: RepairDispatcher<T>;
  maxAttempts?: number;
}

export async function loadWithRepair<T>(args: LoadWithRepairArgs<T>): Promise<T> {
  const max = args.maxAttempts ?? 3;
  for (let attempt = 0; attempt <= max; attempt++) {
    const result = args.load();
    if (result.valid) return result.data;
    if (attempt === max) throw new UnrepairableStateError(result);
    await args.dispatch(result);
  }
  throw new Error("unreachable");
}
```

- [ ] **Step 2: Refactor the adapter-specific wrapper**

Replace `lib/load-adapter-with-repair.ts` with:
```typescript
import { loadAdapter } from "./load-adapter.ts";
import { loadWithRepair, UnrepairableStateError, type RepairDispatcher } from "./load-with-repair.ts";
import type { Adapter } from "../schemas/adapter.ts";

export { UnrepairableStateError };
export class UnrepairableAdapterError extends UnrepairableStateError {
  constructor(lastResult: ConstructorParameters<typeof UnrepairableStateError>[0]) {
    super(lastResult);
    this.name = "UnrepairableAdapterError";
    this.message = `Adapter at ${lastResult.path} could not be auto-repaired after 3 attempts.`;
  }
}

export type { RepairDispatcher };

export async function loadAdapterWithRepair(
  path: string,
  dispatch: RepairDispatcher<Adapter>,
  maxAttempts = 3,
): Promise<Adapter> {
  try {
    return await loadWithRepair<Adapter>({
      path,
      load: () => loadAdapter(path),
      dispatch,
      maxAttempts,
    });
  } catch (err) {
    if (err instanceof UnrepairableStateError && !(err instanceof UnrepairableAdapterError)) {
      throw new UnrepairableAdapterError(err.lastResult as never);
    }
    throw err;
  }
}
```

- [ ] **Step 3: Run all repair tests**

```bash
pnpm test test/load-with-repair.test.ts test/load-adapter-with-repair.test.ts
```

Expected: All pass. The pre-existing adapter test still asserts `UnrepairableAdapterError` instance, which the wrapper preserves.

- [ ] **Step 4: Commit**

```bash
git add lib/load-with-repair.ts lib/load-adapter-with-repair.ts test/load-with-repair.test.ts
git commit -m "feat(plugin): add generic load-with-repair, refactor adapter wrapper"
```

---

## Task 13: state-repairer agent prompt

**Files:**
- Create: `agents/state-repairer.md`

- [ ] **Step 1: Write the agent prompt**

Create `agents/state-repairer.md`:
```markdown
---
name: state-repairer
description: Repairs a Zod-invalid state JSON file (crawl.json, probe.json, etc.) so it satisfies its schema. Dispatched by any phase that loads a state file and receives a diagnostic result. Format-only repair, identical contract to adapter-repairer.
---

# State Repairer Agent

You are fixing a JSON state file that failed Zod validation.

## Input contract

The dispatcher (see `lib/load-with-repair.ts`) passes the diagnostic as a JSON block in the prompt. Expect this shape:

```json
{
  "issues": [
    { "code": "invalid_type", "path": ["pages", 0, "depth"], "message": "Expected number, received string" }
  ],
  "rawJson": { "pages": [{ "url": "https://...", "depth": "zero" }] },
  "path": "/abs/path/to/state.json",
  "schemaSource": "schemas/<name>.ts"
}
```

If `rawJson` is `null`, the file was unparseable JSON; do not invent content from scratch — re-emit the closest plausible valid skeleton based on the schema, but flag the loss in your output summary.

## Your task

Rewrite the JSON at `path` so it satisfies the schema. Pretty-print with 2-space indent. Append a one-line summary of what you changed.

## Rules

1. **Format only.** Coerce types, fill required fields with defaults from the schema (or sensible inferences from sibling fields), drop unknown keys, rename obvious typos.
2. **Preserve all valid data.** Only touch what the issues array points at, plus dependent fields the schema mandates.
3. **Never delete the file.**
4. **Never write to any other path.**

## What you MUST NOT do

- Do not modify the schema file
- Do not invent data not present in `rawJson` unless the schema forces a default
- Do not auto-repair semantic errors (e.g., a `recommendation` of `ABORT_NO_ADAPTER` for a page the user wanted extracted) — those are the calling phase's concern
```

- [ ] **Step 2: Commit**

```bash
git add agents/state-repairer.md
git commit -m "feat(plugin): add state-repairer agent prompt"
```

---

## Task 14: Phase verification schema + phase-state writer — failing test

**Files:**
- Create: `schemas/phase.ts`
- Create: `test/phase-state.test.ts`

- [ ] **Step 1: Create the schema**

Create `schemas/phase.ts`:
```typescript
import { z } from "zod";

export const PhaseVerificationSchema = z.object({
  phase: z.string().min(1),
  passed: z.boolean(),
  checkedAt: z.string().datetime(),
  criteria: z.array(z.object({
    name: z.string(),
    passed: z.boolean(),
    detail: z.string().optional(),
  })).min(1),
  notes: z.string().optional(),
});

export type PhaseVerification = z.infer<typeof PhaseVerificationSchema>;
```

- [ ] **Step 2: Write failing test**

Create `test/phase-state.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  writePlan,
  writeExecution,
  writeVerification,
  readVerification,
} from "../lib/phase-state.ts";

function tempPhaseDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "phase-state-"));
  const phaseDir = join(dir, "phase-1-discover");
  mkdirSync(phaseDir, { recursive: true });
  return phaseDir;
}

describe("phase-state", () => {
  it("writePlan creates PLAN.md with the provided body", async () => {
    const phaseDir = tempPhaseDir();
    await writePlan(phaseDir, "Crawl https://example.com");
    const contents = readFileSync(join(phaseDir, "PLAN.md"), "utf8");
    expect(contents).toContain("Crawl https://example.com");
  });

  it("writeExecution appends a timestamped entry", async () => {
    const phaseDir = tempPhaseDir();
    await writeExecution(phaseDir, "Crawl complete: 3 pages.");
    await writeExecution(phaseDir, "Probe complete: 3 pages.");
    const contents = readFileSync(join(phaseDir, "EXECUTION.md"), "utf8");
    expect(contents).toMatch(/Crawl complete/);
    expect(contents).toMatch(/Probe complete/);
    // each entry has an ISO-ish timestamp prefix
    expect(contents.match(/\d{4}-\d{2}-\d{2}T/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("writeVerification writes a markdown file AND the JSON sidecar", async () => {
    const phaseDir = tempPhaseDir();
    await writeVerification(phaseDir, {
      phase: "phase-1-discover",
      passed: true,
      checkedAt: "2026-04-29T12:00:00.000Z",
      criteria: [
        { name: "crawl.json valid", passed: true },
        { name: "every page has adapter or ABORT", passed: true },
      ],
    });
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "verification.json"))).toBe(true);
    const md = readFileSync(join(phaseDir, "VERIFICATION.md"), "utf8");
    expect(md).toContain("# Verification");
    expect(md).toContain("✅");
  });

  it("does NOT write VERIFICATION.md when passed: false", async () => {
    const phaseDir = tempPhaseDir();
    await writeVerification(phaseDir, {
      phase: "phase-1-discover",
      passed: false,
      checkedAt: "2026-04-29T12:00:00.000Z",
      criteria: [{ name: "x", passed: false, detail: "missing" }],
    });
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(false);
    expect(existsSync(join(phaseDir, "verification.json"))).toBe(true);
  });

  it("readVerification round-trips the JSON sidecar", async () => {
    const phaseDir = tempPhaseDir();
    const v = {
      phase: "phase-1-discover",
      passed: true,
      checkedAt: "2026-04-29T12:00:00.000Z",
      criteria: [{ name: "x", passed: true }],
    };
    await writeVerification(phaseDir, v);
    const read = await readVerification(phaseDir);
    expect(read).toEqual(v);
  });
});
```

- [ ] **Step 3: Run — expect fail**

Expected: module-not-found.

---

## Task 15: phase-state writer — implementation

**Files:**
- Create: `lib/phase-state.ts`

- [ ] **Step 1: Implement**

Create `lib/phase-state.ts`:
```typescript
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PhaseVerificationSchema, type PhaseVerification } from "../schemas/phase.ts";

export async function writePlan(phaseDir: string, body: string): Promise<void> {
  writeFileSync(join(phaseDir, "PLAN.md"), body.endsWith("\n") ? body : `${body}\n`);
}

export async function writeExecution(phaseDir: string, entry: string): Promise<void> {
  const stamped = `## ${new Date().toISOString()}\n\n${entry}\n\n`;
  appendFileSync(join(phaseDir, "EXECUTION.md"), stamped);
}

export async function writeVerification(
  phaseDir: string,
  verification: PhaseVerification,
): Promise<void> {
  const validated = PhaseVerificationSchema.parse(verification);
  writeFileSync(
    join(phaseDir, "verification.json"),
    JSON.stringify(validated, null, 2) + "\n",
  );
  if (!validated.passed) return;
  writeFileSync(
    join(phaseDir, "VERIFICATION.md"),
    renderVerificationMd(validated),
  );
}

export async function readVerification(phaseDir: string): Promise<PhaseVerification | null> {
  const path = join(phaseDir, "verification.json");
  if (!existsSync(path)) return null;
  const data = JSON.parse(readFileSync(path, "utf8"));
  return PhaseVerificationSchema.parse(data);
}

function renderVerificationMd(v: PhaseVerification): string {
  const lines = [
    `# Verification — ${v.phase}`,
    "",
    `**Status:** ${v.passed ? "✅ passed" : "❌ failed"}`,
    `**Checked at:** ${v.checkedAt}`,
    "",
    "## Criteria",
    "",
  ];
  for (const c of v.criteria) {
    lines.push(`- ${c.passed ? "✅" : "❌"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  if (v.notes) {
    lines.push("", "## Notes", "", v.notes);
  }
  lines.push("");
  return lines.join("\n");
}
```

- [ ] **Step 2: Run test**

```bash
pnpm test test/phase-state.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 3: Commit**

```bash
git add schemas/phase.ts lib/phase-state.ts test/phase-state.test.ts
git commit -m "feat(plugin): add phase-state writer with verification gate"
```

---

## Task 16: Phase status scanner — failing test + implementation

**Files:**
- Create: `test/phase-status.test.ts`
- Create: `lib/phase-status.ts`

- [ ] **Step 1: Write failing test**

Create `test/phase-status.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { firstIncompletePhase, completedPhases, knownPhases } from "../lib/phase-status.ts";

function makeRun(): string {
  const root = mkdtempSync(join(tmpdir(), "phase-status-"));
  const run = join(root, ".migration/runs/001-initial");
  mkdirSync(run, { recursive: true });
  return run;
}

describe("phase-status", () => {
  it("knownPhases lists the 8 phases in order", () => {
    expect(knownPhases.map(p => p.dir)).toEqual([
      "phase-1-discover",
      "phase-2-analyze",
      "phase-3-plan",
      "phase-4-extract",
      "phase-5-build",
      "phase-6-visual",
      "phase-7-animate",
      "phase-8-perf",
    ]);
  });

  it("returns phase-1-discover when no phase dirs exist", () => {
    const run = makeRun();
    expect(firstIncompletePhase(run)).toBe("phase-1-discover");
    expect(completedPhases(run)).toEqual([]);
  });

  it("skips phases with VERIFICATION.md present", () => {
    const run = makeRun();
    const p1 = join(run, "phase-1-discover");
    mkdirSync(p1, { recursive: true });
    writeFileSync(join(p1, "VERIFICATION.md"), "# verified");
    expect(firstIncompletePhase(run)).toBe("phase-2-analyze");
    expect(completedPhases(run)).toEqual(["phase-1-discover"]);
  });

  it("returns null when all known phases are verified", () => {
    const run = makeRun();
    for (const p of ["phase-1-discover", "phase-2-analyze", "phase-3-plan",
                     "phase-4-extract", "phase-5-build", "phase-6-visual",
                     "phase-7-animate", "phase-8-perf"]) {
      const dir = join(run, p);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "VERIFICATION.md"), "# verified");
    }
    expect(firstIncompletePhase(run)).toBeNull();
  });

  it("respects 'wireframe' goal — stops after phase-5-build", () => {
    const run = makeRun();
    for (const p of ["phase-1-discover", "phase-2-analyze", "phase-3-plan",
                     "phase-4-extract", "phase-5-build"]) {
      const dir = join(run, p);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "VERIFICATION.md"), "# verified");
    }
    expect(firstIncompletePhase(run, { goal: "wireframe" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect fail**

Expected: module-not-found.

- [ ] **Step 3: Implement**

Create `lib/phase-status.ts`:
```typescript
import { existsSync } from "node:fs";
import { join } from "node:path";

export const knownPhases = [
  { dir: "phase-1-discover", goalMin: "wireframe" as const },
  { dir: "phase-2-analyze", goalMin: "wireframe" as const },
  { dir: "phase-3-plan", goalMin: "wireframe" as const },
  { dir: "phase-4-extract", goalMin: "wireframe" as const },
  { dir: "phase-5-build", goalMin: "wireframe" as const },
  { dir: "phase-6-visual", goalMin: "pixel-perfect" as const },
  { dir: "phase-7-animate", goalMin: "pixel-perfect" as const },
  { dir: "phase-8-perf", goalMin: "pixel-perfect" as const },
];

export type Goal = "wireframe" | "pixel-perfect";

function inScope(p: typeof knownPhases[number], goal: Goal): boolean {
  if (goal === "pixel-perfect") return true;
  return p.goalMin === "wireframe";
}

export function firstIncompletePhase(
  runDir: string,
  opts: { goal?: Goal } = {},
): string | null {
  const goal = opts.goal ?? "pixel-perfect";
  for (const p of knownPhases) {
    if (!inScope(p, goal)) continue;
    const verified = existsSync(join(runDir, p.dir, "VERIFICATION.md"));
    if (!verified) return p.dir;
  }
  return null;
}

export function completedPhases(runDir: string): string[] {
  return knownPhases
    .map(p => p.dir)
    .filter(d => existsSync(join(runDir, d, "VERIFICATION.md")));
}
```

- [ ] **Step 4: Run test**

Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/phase-status.ts test/phase-status.test.ts
git commit -m "feat(plugin): add phase-status scanner"
```

---

## Task 17: Crawl runner with in-process HTTP fixture — failing test

**Files:**
- Create: `test/fixtures/site-fixture/index.html`
- Create: `test/fixtures/site-fixture/about.html`
- Create: `test/fixtures/site-fixture/pricing.html`
- Create: `test/fixtures/site-fixture/robots.txt`
- Create: `test/crawl-runner.test.ts`

- [ ] **Step 1: Create the static site fixture**

Create `test/fixtures/site-fixture/index.html`:
```html
<!doctype html>
<html><head><title>Home</title></head>
<body>
  <a href="/about">About</a>
  <a href="/pricing">Pricing</a>
  <a href="https://external.example.org/x">External</a>
</body></html>
```

Create `test/fixtures/site-fixture/about.html`:
```html
<!doctype html>
<html><head><title>About</title></head>
<body><a href="/">Home</a></body></html>
```

Create `test/fixtures/site-fixture/pricing.html`:
```html
<!doctype html>
<html><head><title>Pricing</title></head>
<body><a href="/">Home</a></body></html>
```

Create `test/fixtures/site-fixture/robots.txt`:
```
User-agent: *
Disallow: /admin
```

- [ ] **Step 2: Write the failing runner test**

Create `test/crawl-runner.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import getPort from "get-port";
import { runCrawl } from "../lib/crawl-runner.ts";
import { CrawlSchema } from "../schemas/crawl.ts";

const fixtureDir = fileURLToPath(new URL("./fixtures/site-fixture/", import.meta.url));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const port = await getPort();
  server = createServer((req, res) => {
    const url = req.url === "/" ? "/index.html" : req.url!.split("?")[0];
    const file = url === "/robots.txt" ? "robots.txt" : `${url.replace(/^\//, "").replace(/\/$/, "")}.html`;
    const path = join(fixtureDir, file === ".html" ? "index.html" : file);
    if (!existsSync(path)) { res.statusCode = 404; res.end("nope"); return; }
    const isHtml = file.endsWith(".html");
    res.setHeader("Content-Type", isHtml ? "text/html" : "text/plain");
    res.end(readFileSync(path, "utf8"));
  });
  await new Promise<void>(r => server.listen(port, r));
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>(r => server.close(() => r())));

describe("runCrawl", () => {
  it("crawls the seed and discovered pages, writes a schema-valid crawl.json", async () => {
    const out = mkdtempSync(join(tmpdir(), "crawl-out-"));
    const crawlPath = join(out, "crawl.json");
    await runCrawl({
      sourceUrl: baseUrl + "/",
      outputPath: crawlPath,
      maxPages: 10,
      maxDepth: 2,
    });
    expect(existsSync(crawlPath)).toBe(true);
    const data = JSON.parse(readFileSync(crawlPath, "utf8"));
    const validated = CrawlSchema.parse(data);
    const urls = validated.pages.map(p => new URL(p.url).pathname).sort();
    expect(urls).toEqual(["/", "/about", "/pricing"]);
    expect(validated.pages.find(p => p.url.endsWith("/"))?.discoveredVia).toBe("seed");
    expect(validated.pages.find(p => p.url.endsWith("/about"))?.discoveredVia).toBe("link");
  });

  it("does not follow external links off the source origin", async () => {
    const out = mkdtempSync(join(tmpdir(), "crawl-out-"));
    const crawlPath = join(out, "crawl.json");
    await runCrawl({
      sourceUrl: baseUrl + "/",
      outputPath: crawlPath,
      maxPages: 10,
      maxDepth: 2,
    });
    const data = CrawlSchema.parse(JSON.parse(readFileSync(crawlPath, "utf8")));
    expect(data.pages.every(p => p.url.startsWith(baseUrl))).toBe(true);
  });

  it("respects maxPages", async () => {
    const out = mkdtempSync(join(tmpdir(), "crawl-out-"));
    const crawlPath = join(out, "crawl.json");
    await runCrawl({
      sourceUrl: baseUrl + "/",
      outputPath: crawlPath,
      maxPages: 1,
      maxDepth: 2,
    });
    const data = CrawlSchema.parse(JSON.parse(readFileSync(crawlPath, "utf8")));
    expect(data.pages).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run — expect fail**

Expected: `Cannot find module '../lib/crawl-runner.ts'`.

---

## Task 18: Crawl runner — implementation

**Files:**
- Create: `lib/crawl-runner.ts`
- Create: `scripts/crawl-site.ts`

- [ ] **Step 1: Implement the script**

Create `scripts/crawl-site.ts`:
```typescript
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

interface Args {
  sourceUrl: string;
  outputPath: string;
  maxPages: number;
  maxDepth: number;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const sourceUrl = get("--source-url");
  const outputPath = get("--output");
  const maxPages = Number(get("--max-pages") ?? "50");
  const maxDepth = Number(get("--max-depth") ?? "3");
  if (!sourceUrl || !outputPath) {
    throw new Error("Usage: crawl-site --source-url <url> --output <path> [--max-pages N] [--max-depth N]");
  }
  return { sourceUrl, outputPath, maxPages, maxDepth };
}

function urlToSlug(url: string): string {
  const u = new URL(url);
  const p = u.pathname.replace(/^\/+|\/+$/g, "");
  if (!p) return "home";
  return p.toLowerCase().replace(/[^a-z0-9/]+/g, "-").replace(/\/+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

async function fetchRobots(origin: string): Promise<{ fetched: boolean; disallowedPaths: string[] }> {
  try {
    const res = await fetch(new URL("/robots.txt", origin));
    if (!res.ok) return { fetched: false, disallowedPaths: [] };
    const text = await res.text();
    const disallowed: string[] = [];
    let appliesToAll = false;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const [k, ...rest] = line.split(":");
      const v = rest.join(":").trim();
      if (k.toLowerCase() === "user-agent") appliesToAll = v === "*";
      else if (appliesToAll && k.toLowerCase() === "disallow" && v) disallowed.push(v);
    }
    return { fetched: true, disallowedPaths: disallowed };
  } catch {
    return { fetched: false, disallowedPaths: [] };
  }
}

function isAllowed(path: string, disallowed: string[]): boolean {
  return !disallowed.some(prefix => path.startsWith(prefix));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const seed = new URL(args.sourceUrl);
  const origin = seed.origin;
  const robots = await fetchRobots(origin);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  interface Visited {
    url: string;
    depth: number;
    discoveredVia: "seed" | "sitemap" | "link";
    title: string;
    status: number;
    outboundLinks: string[];
  }
  const visited = new Map<string, Visited>();
  const errors: { url: string; reason: string }[] = [];
  const queue: { url: string; depth: number; via: Visited["discoveredVia"] }[] = [
    { url: seed.href, depth: 0, via: "seed" },
  ];

  while (queue.length > 0 && visited.size < args.maxPages) {
    const next = queue.shift()!;
    const norm = normalize(next.url);
    if (visited.has(norm)) continue;
    if (next.depth > args.maxDepth) continue;
    const u = new URL(norm);
    if (u.origin !== origin) continue;
    if (!isAllowed(u.pathname, robots.disallowedPaths)) continue;

    try {
      const resp = await page.goto(norm, { waitUntil: "domcontentloaded", timeout: 15_000 });
      const status = resp?.status() ?? 0;
      const title = await page.title();
      const links = await page.$$eval("a[href]", as =>
        (as as HTMLAnchorElement[]).map(a => a.href).filter(h => h.startsWith("http")),
      );
      visited.set(norm, {
        url: norm, depth: next.depth, discoveredVia: next.via,
        title, status, outboundLinks: links,
      });
      for (const l of links) {
        const ln = normalize(l);
        if (!visited.has(ln) && new URL(ln).origin === origin) {
          queue.push({ url: ln, depth: next.depth + 1, via: "link" });
        }
      }
    } catch (err) {
      errors.push({ url: norm, reason: (err as Error).message });
    }
  }

  await browser.close();

  const crawl = {
    sourceUrl: args.sourceUrl,
    crawledAt: new Date().toISOString(),
    limits: { maxPages: args.maxPages, maxDepth: args.maxDepth },
    robotsTxt: robots,
    sitemapUrls: [],
    pages: [...visited.values()].map(v => ({ ...v, slug: urlToSlug(v.url) })),
    errors,
  };

  mkdirSync(dirname(args.outputPath), { recursive: true });
  writeFileSync(args.outputPath, JSON.stringify(crawl, null, 2));
}

function normalize(url: string): string {
  const u = new URL(url);
  u.hash = "";
  u.search = "";
  if (u.pathname.endsWith("/") && u.pathname.length > 1) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }
  return u.href;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Implement the runner**

Create `lib/crawl-runner.ts`:
```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const execFileP = promisify(execFile);

export interface RunCrawlArgs {
  sourceUrl: string;
  outputPath: string;
  maxPages?: number;
  maxDepth?: number;
  pluginRoot?: string;
}

export async function runCrawl(args: RunCrawlArgs): Promise<void> {
  const root = args.pluginRoot ?? defaultPluginRoot();
  const script = resolve(root, "scripts/crawl-site.ts");
  await execFileP("npx", [
    "tsx", script,
    "--source-url", args.sourceUrl,
    "--output", args.outputPath,
    "--max-pages", String(args.maxPages ?? 50),
    "--max-depth", String(args.maxDepth ?? 3),
  ], { env: process.env });
}

function defaultPluginRoot(): string {
  return resolve(fileURLToPath(new URL("..", import.meta.url)));
}
```

- [ ] **Step 3: Run runner test**

```bash
pnpm test test/crawl-runner.test.ts
```

Expected: PASS (3 tests). The first run downloads no extra browser binaries (Task 1 already installed Chromium).

- [ ] **Step 4: Commit**

```bash
git add scripts/crawl-site.ts lib/crawl-runner.ts test/crawl-runner.test.ts test/fixtures/site-fixture/
git commit -m "feat(plugin): add crawl-site script and runner"
```

---

## Task 19: Probe runner — failing test

**Files:**
- Create: `test/fixtures/probe-output/webflow.json`
- Create: `test/fixtures/probe-output/unmatched.json`
- Create: `test/probe-runner.test.ts`

- [ ] **Step 1: Create probe-output fixtures**

These mimic the JSON shape that `scripts/probe-page.ts` already prints to stdout. The runner aggregates them into a `probe.json`.

Create `test/fixtures/probe-output/webflow.json`:
```json
{
  "url": "https://example.com/",
  "matchedAdapters": ["webflow"],
  "recommendation": "DIRECT_EXTRACTION",
  "detectedCMP": null,
  "spaAnalysis": { "isSPA": false }
}
```

Create `test/fixtures/probe-output/unmatched.json`:
```json
{
  "url": "https://example.com/spa",
  "matchedAdapters": [],
  "recommendation": "ABORT_NO_ADAPTER",
  "detectedCMP": "OneTrust",
  "spaAnalysis": { "isSPA": true }
}
```

- [ ] **Step 2: Write the failing runner test**

Create `test/probe-runner.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runProbeBatch } from "../lib/probe-runner.ts";
import { ProbeSchema } from "../schemas/probe.ts";

const fixtureRaw = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/probe-output/${name}`, import.meta.url)), "utf8");

describe("runProbeBatch", () => {
  it("aggregates per-URL probe outputs into a schema-valid probe.json", async () => {
    const out = mkdtempSync(join(tmpdir(), "probe-out-"));
    const outPath = join(out, "probe.json");
    const stub = async (url: string) => {
      if (url.endsWith("/spa")) return JSON.parse(fixtureRaw("unmatched.json"));
      return JSON.parse(fixtureRaw("webflow.json"));
    };
    await runProbeBatch({
      urls: ["https://example.com/", "https://example.com/spa"],
      outputPath: outPath,
      probeOne: stub,
    });
    expect(existsSync(outPath)).toBe(true);
    const validated = ProbeSchema.parse(JSON.parse(readFileSync(outPath, "utf8")));
    expect(validated.pages).toHaveLength(2);
    expect(validated.pages[1].recommendation).toBe("ABORT_NO_ADAPTER");
    expect(validated.pages[1].detectedCMP).toBe("OneTrust");
    expect(validated.pages[1].isSPA).toBe(true);
  });

  it("captures per-URL failures as ABORT_NO_ADAPTER + isSPA:false", async () => {
    const out = mkdtempSync(join(tmpdir(), "probe-out-"));
    const outPath = join(out, "probe.json");
    const stub = async () => { throw new Error("network kaboom"); };
    await runProbeBatch({
      urls: ["https://example.com/"],
      outputPath: outPath,
      probeOne: stub,
    });
    const validated = ProbeSchema.parse(JSON.parse(readFileSync(outPath, "utf8")));
    expect(validated.pages[0].recommendation).toBe("ABORT_NO_ADAPTER");
    expect(validated.pages[0].matchedAdapters).toEqual([]);
  });
});
```

- [ ] **Step 3: Run — expect fail**

Expected: module-not-found.

---

## Task 20: Probe runner — implementation

**Files:**
- Create: `lib/probe-runner.ts`

- [ ] **Step 1: Implement**

Create `lib/probe-runner.ts`:
```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ProbeSchema, type ProbedPage } from "../schemas/probe.ts";

const execFileP = promisify(execFile);

export interface RunProbeBatchArgs {
  urls: string[];
  outputPath: string;
  pluginRoot?: string;
  probeOne?: (url: string) => Promise<unknown>;
}

export async function runProbeBatch(args: RunProbeBatchArgs): Promise<void> {
  const probeOne = args.probeOne ?? defaultProbeOne(args.pluginRoot);
  const pages: ProbedPage[] = [];
  for (const url of args.urls) {
    try {
      const raw = await probeOne(url);
      pages.push(normalize(raw, url));
    } catch (err) {
      pages.push({
        url, matchedAdapters: [], recommendation: "ABORT_NO_ADAPTER",
        detectedCMP: null, isSPA: false,
      });
    }
  }
  const probe = { probedAt: new Date().toISOString(), pages };
  const validated = ProbeSchema.parse(probe);
  mkdirSync(dirname(args.outputPath), { recursive: true });
  writeFileSync(args.outputPath, JSON.stringify(validated, null, 2));
}

function normalize(raw: unknown, url: string): ProbedPage {
  const r = raw as Record<string, unknown>;
  const isSPA = Boolean(
    (r.spaAnalysis as Record<string, unknown> | undefined)?.isSPA ?? r.isSPA ?? false,
  );
  return {
    url: (r.url as string) ?? url,
    matchedAdapters: Array.isArray(r.matchedAdapters) ? (r.matchedAdapters as string[]) : [],
    recommendation: (r.recommendation as ProbedPage["recommendation"]) ?? "ABORT_NO_ADAPTER",
    detectedCMP: (r.detectedCMP as string | null | undefined) ?? null,
    isSPA,
  };
}

function defaultProbeOne(pluginRoot?: string): (url: string) => Promise<unknown> {
  const root = pluginRoot ?? resolve(fileURLToPath(new URL("..", import.meta.url)));
  const script = resolve(root, "scripts/probe-page.ts");
  return async (url: string) => {
    const { stdout } = await execFileP("npx", ["tsx", script, url], { env: process.env });
    const lastJson = extractTrailingJson(stdout);
    return JSON.parse(lastJson);
  };
}

function extractTrailingJson(stdout: string): string {
  // probe-page.ts may print logs before the report. Take the last balanced { ... } block.
  const end = stdout.lastIndexOf("}");
  if (end < 0) throw new Error("no JSON in probe-page output");
  let depth = 0;
  for (let i = end; i >= 0; i--) {
    const ch = stdout[i];
    if (ch === "}") depth++;
    else if (ch === "{") {
      depth--;
      if (depth === 0) return stdout.slice(i, end + 1);
    }
  }
  throw new Error("unbalanced JSON in probe-page output");
}
```

- [ ] **Step 2: Run test**

```bash
pnpm test test/probe-runner.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 3: Commit**

```bash
git add lib/probe-runner.ts test/probe-runner.test.ts test/fixtures/probe-output/
git commit -m "feat(plugin): add probe runner with stub injection"
```

---

## Task 21: Discover phase driver — failing test

**Files:**
- Create: `test/discover.test.ts`

- [ ] **Step 1: Write failing test**

Create `test/discover.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "node:http";
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import getPort from "get-port";
import { runDiscover } from "../lib/discover.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";
import { CrawlSchema } from "../schemas/crawl.ts";
import { ProbeSchema } from "../schemas/probe.ts";

const fixtureDir = fileURLToPath(new URL("./fixtures/site-fixture/", import.meta.url));
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const port = await getPort();
  server = createServer((req, res) => {
    const url = req.url === "/" ? "/index.html" : req.url!.split("?")[0];
    const file = url === "/robots.txt" ? "robots.txt" : `${url.replace(/^\//, "").replace(/\/$/, "")}.html`;
    const path = join(fixtureDir, file === ".html" ? "index.html" : file);
    if (!existsSync(path)) { res.statusCode = 404; res.end("nope"); return; }
    res.setHeader("Content-Type", file.endsWith(".html") ? "text/html" : "text/plain");
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

describe("runDiscover", () => {
  it("writes crawl.json + probe.json + VERIFICATION.md when every page has a matched adapter", async () => {
    const root = mkdtempSync(join(tmpdir(), "discover-"));
    await bootstrapMigration({ targetDir: root, site: baseSite(baseUrl + "/") });
    const allMatched = async (url: string) => ({
      url, matchedAdapters: ["static-html"], recommendation: "DIRECT_EXTRACTION",
      detectedCMP: null, spaAnalysis: { isSPA: false },
    });
    await runDiscover({
      targetDir: root,
      runDir: "001-initial",
      probeOne: allMatched,
    });
    const phaseDir = join(root, ".migration/runs/001-initial/phase-1-discover");
    expect(existsSync(join(phaseDir, "discovery/crawl.json"))).toBe(true);
    expect(existsSync(join(phaseDir, "discovery/probe.json"))).toBe(true);
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "PLAN.md"))).toBe(true);
    expect(existsSync(join(phaseDir, "EXECUTION.md"))).toBe(true);
    CrawlSchema.parse(JSON.parse(readFileSync(join(phaseDir, "discovery/crawl.json"), "utf8")));
    ProbeSchema.parse(JSON.parse(readFileSync(join(phaseDir, "discovery/probe.json"), "utf8")));
  });

  it("does NOT emit VERIFICATION.md when any page is ABORT_NO_ADAPTER without explicit user opt-in", async () => {
    const root = mkdtempSync(join(tmpdir(), "discover-"));
    await bootstrapMigration({ targetDir: root, site: baseSite(baseUrl + "/") });
    const someAbort = async (url: string) => {
      if (url.endsWith("/about")) {
        return { url, matchedAdapters: [], recommendation: "ABORT_NO_ADAPTER",
                 detectedCMP: null, spaAnalysis: { isSPA: false } };
      }
      return { url, matchedAdapters: ["static-html"], recommendation: "DIRECT_EXTRACTION",
               detectedCMP: null, spaAnalysis: { isSPA: false } };
    };
    await runDiscover({
      targetDir: root,
      runDir: "001-initial",
      probeOne: someAbort,
      confirmAborts: false,
    });
    const phaseDir = join(root, ".migration/runs/001-initial/phase-1-discover");
    expect(existsSync(join(phaseDir, "discovery/crawl.json"))).toBe(true);
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(false);
    const json = JSON.parse(readFileSync(join(phaseDir, "verification.json"), "utf8"));
    expect(json.passed).toBe(false);
    expect(json.criteria.find((c: { name: string }) => c.name.includes("adapter")).passed).toBe(false);
  });

  it("emits VERIFICATION.md when ABORT pages are explicitly confirmed by the user", async () => {
    const root = mkdtempSync(join(tmpdir(), "discover-"));
    await bootstrapMigration({ targetDir: root, site: baseSite(baseUrl + "/") });
    const someAbort = async (url: string) => ({
      url,
      matchedAdapters: url.endsWith("/about") ? [] : ["static-html"],
      recommendation: url.endsWith("/about") ? "ABORT_NO_ADAPTER" : "DIRECT_EXTRACTION",
      detectedCMP: null,
      spaAnalysis: { isSPA: false },
    });
    await runDiscover({
      targetDir: root,
      runDir: "001-initial",
      probeOne: someAbort,
      confirmAborts: true,
      confirmPageList: true,
    });
    const phaseDir = join(root, ".migration/runs/001-initial/phase-1-discover");
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(true);
  });

  it("does NOT emit VERIFICATION.md when the user has not confirmed the page list", async () => {
    const root = mkdtempSync(join(tmpdir(), "discover-"));
    await bootstrapMigration({ targetDir: root, site: baseSite(baseUrl + "/") });
    const matched = async (url: string) => ({
      url, matchedAdapters: ["static-html"], recommendation: "DIRECT_EXTRACTION",
      detectedCMP: null, spaAnalysis: { isSPA: false },
    });
    await runDiscover({
      targetDir: root, runDir: "001-initial",
      probeOne: matched, confirmPageList: false,
    });
    const phaseDir = join(root, ".migration/runs/001-initial/phase-1-discover");
    expect(existsSync(join(phaseDir, "VERIFICATION.md"))).toBe(false);
    const v = JSON.parse(readFileSync(join(phaseDir, "verification.json"), "utf8"));
    expect(v.criteria.find((c: { name: string }) => c.name.includes("page list")).passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Expected: module-not-found.

---

## Task 22: Discover phase driver — implementation

**Files:**
- Create: `lib/discover.ts`

- [ ] **Step 1: Implement**

Create `lib/discover.ts`:
```typescript
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runCrawl } from "./crawl-runner.ts";
import { runProbeBatch } from "./probe-runner.ts";
import { loadCrawl } from "./load-crawl.ts";
import { loadProbe } from "./load-probe.ts";
import { writePlan, writeExecution, writeVerification } from "./phase-state.ts";

export interface RunDiscoverArgs {
  targetDir: string;            // user project root (parent of .migration/)
  runDir: string;               // e.g., "001-initial"
  maxPages?: number;
  maxDepth?: number;
  pluginRoot?: string;
  probeOne?: (url: string) => Promise<unknown>;   // for test injection
  confirmPageList?: boolean;    // defaults to false in attended mode; true in unattended
  confirmAborts?: boolean;      // user explicitly OK'd ABORT_NO_ADAPTER pages
}

export async function runDiscover(args: RunDiscoverArgs): Promise<void> {
  const { sourceUrl, mode } = await readSiteConfig(args.targetDir);
  const phaseDir = join(args.targetDir, ".migration/runs", args.runDir, "phase-1-discover");
  const discoveryDir = join(phaseDir, "discovery");
  mkdirSync(discoveryDir, { recursive: true });

  await writePlan(
    phaseDir,
    `# Phase 1 — Discover\n\nCrawl ${sourceUrl} and probe each discovered page.\n\nMaxPages: ${args.maxPages ?? 50} | MaxDepth: ${args.maxDepth ?? 3}\n`,
  );

  const crawlPath = join(discoveryDir, "crawl.json");
  await runCrawl({
    sourceUrl,
    outputPath: crawlPath,
    maxPages: args.maxPages,
    maxDepth: args.maxDepth,
    pluginRoot: args.pluginRoot,
  });
  await writeExecution(phaseDir, `Crawl complete → ${crawlPath}`);

  const crawlResult = loadCrawl(crawlPath);
  if (!crawlResult.valid) {
    await writeVerification(phaseDir, {
      phase: "phase-1-discover", passed: false,
      checkedAt: new Date().toISOString(),
      criteria: [{ name: "crawl.json valid", passed: false, detail: crawlResult.issues[0]?.message }],
    });
    return;
  }

  const probePath = join(discoveryDir, "probe.json");
  await runProbeBatch({
    urls: crawlResult.data.pages.map(p => p.url),
    outputPath: probePath,
    pluginRoot: args.pluginRoot,
    probeOne: args.probeOne,
  });
  await writeExecution(phaseDir, `Probe complete → ${probePath}`);

  const probeResult = loadProbe(probePath);
  const probeValid = probeResult.valid;
  const aborts = probeValid
    ? probeResult.data.pages.filter(p => p.recommendation === "ABORT_NO_ADAPTER")
    : [];

  const adapterGate = probeValid && (aborts.length === 0 || args.confirmAborts === true);
  const pageListGate = isUnattended(mode) ? true : args.confirmPageList === true;

  await writeVerification(phaseDir, {
    phase: "phase-1-discover",
    passed: crawlResult.valid && probeValid && adapterGate && pageListGate,
    checkedAt: new Date().toISOString(),
    criteria: [
      { name: "crawl.json valid", passed: crawlResult.valid },
      { name: "probe.json valid", passed: probeValid },
      {
        name: "every page has matched adapter or confirmed ABORT",
        passed: adapterGate,
        detail: aborts.length > 0
          ? `${aborts.length} page(s) had no matched adapter; ${args.confirmAborts ? "user confirmed" : "user has not confirmed"}.`
          : undefined,
      },
      {
        name: "user confirmed page list",
        passed: pageListGate,
        detail: isUnattended(mode) ? "auto-confirmed (unattended mode)" : (args.confirmPageList ? "user confirmed" : "awaiting confirmation"),
      },
    ],
  });
}

async function readSiteConfig(targetDir: string): Promise<{ sourceUrl: string; mode: string }> {
  const { loadSite } = await import("./load-site.ts");
  const result = loadSite(join(targetDir, ".migration/SITE.md"));
  if (!result.valid) throw new Error(`SITE.md is invalid: ${JSON.stringify(result.issues)}`);
  return { sourceUrl: result.site.sourceUrl, mode: result.site.mode };
}

function isUnattended(mode: string): boolean {
  return mode === "unattended";
}
```

- [ ] **Step 2: Run discover test**

```bash
pnpm test test/discover.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 3: Commit**

```bash
git add lib/discover.ts test/discover.test.ts
git commit -m "feat(plugin): add Phase 1 discover driver with verification gate"
```

---

## Task 23: /migrate:continue resume logic — failing test

**Files:**
- Create: `test/continue.test.ts`

- [ ] **Step 1: Write failing test**

Create `test/continue.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resumeMigration } from "../lib/continue.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";

const baseSite = {
  sourceUrl: "https://example.com",
  target: "./",
  mode: "unattended" as const,
  goal: "wireframe" as const,
  inputMode: "url-only" as const,
  maxParallelPages: 4,
  maxParallelSections: 4,
};

describe("resumeMigration", () => {
  it("returns { kind: 'not-initialized' } when there is no .migration/", async () => {
    const target = mkdtempSync(join(tmpdir(), "cont-"));
    const result = await resumeMigration(target, {});
    expect(result.kind).toBe("not-initialized");
  });

  it("dispatches phase-1-discover on a fresh bootstrap", async () => {
    const target = mkdtempSync(join(tmpdir(), "cont-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    const dispatched: string[] = [];
    const dispatchers = {
      "phase-1-discover": vi.fn(async () => { dispatched.push("phase-1-discover"); }),
    };
    const result = await resumeMigration(target, { dispatchers });
    expect(result.kind).toBe("dispatched");
    if (result.kind === "dispatched") expect(result.phase).toBe("phase-1-discover");
    expect(dispatched).toEqual(["phase-1-discover"]);
  });

  it("returns { kind: 'all-done' } when wireframe goal phases 1-5 are all verified", async () => {
    const target = mkdtempSync(join(tmpdir(), "cont-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    const run = join(target, ".migration/runs/001-initial");
    for (const p of ["phase-1-discover", "phase-2-analyze", "phase-3-plan",
                     "phase-4-extract", "phase-5-build"]) {
      mkdirSync(join(run, p), { recursive: true });
      writeFileSync(join(run, p, "VERIFICATION.md"), "# verified");
    }
    const result = await resumeMigration(target, {});
    expect(result.kind).toBe("all-done");
  });

  it("returns { kind: 'no-dispatcher', phase } when the next phase has no registered dispatcher", async () => {
    const target = mkdtempSync(join(tmpdir(), "cont-"));
    await bootstrapMigration({ targetDir: target, site: baseSite });
    const run = join(target, ".migration/runs/001-initial");
    mkdirSync(join(run, "phase-1-discover"), { recursive: true });
    writeFileSync(join(run, "phase-1-discover/VERIFICATION.md"), "# verified");
    const result = await resumeMigration(target, { dispatchers: {} });
    expect(result.kind).toBe("no-dispatcher");
    if (result.kind === "no-dispatcher") expect(result.phase).toBe("phase-2-analyze");
  });
});
```

- [ ] **Step 2: Run — expect fail**

Expected: module-not-found.

---

## Task 24: /migrate:continue resume logic — implementation

**Files:**
- Create: `lib/continue.ts`

- [ ] **Step 1: Implement**

Create `lib/continue.ts`:
```typescript
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadSite } from "./load-site.ts";
import { firstIncompletePhase } from "./phase-status.ts";

export type PhaseDispatcher = (args: { targetDir: string; runDir: string }) => Promise<void>;

export type ResumeResult =
  | { kind: "not-initialized" }
  | { kind: "all-done" }
  | { kind: "dispatched"; phase: string; runDir: string }
  | { kind: "no-dispatcher"; phase: string; runDir: string };

export interface ResumeArgs {
  dispatchers?: Record<string, PhaseDispatcher>;
}

export async function resumeMigration(
  targetDir: string,
  args: ResumeArgs,
): Promise<ResumeResult> {
  const migDir = join(targetDir, ".migration");
  if (!existsSync(migDir)) return { kind: "not-initialized" };

  const siteResult = loadSite(join(migDir, "SITE.md"));
  if (!siteResult.valid) {
    throw new Error(`SITE.md is invalid: ${JSON.stringify(siteResult.issues)}`);
  }

  const runs = readdirSync(join(migDir, "runs"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const activeRun = runs[runs.length - 1] ?? "001-initial";
  const runDir = join(migDir, "runs", activeRun);

  const next = firstIncompletePhase(runDir, { goal: siteResult.site.goal });
  if (next === null) return { kind: "all-done" };

  const dispatcher = args.dispatchers?.[next];
  if (!dispatcher) return { kind: "no-dispatcher", phase: next, runDir: activeRun };

  await dispatcher({ targetDir, runDir: activeRun });
  return { kind: "dispatched", phase: next, runDir: activeRun };
}
```

- [ ] **Step 2: Run test**

```bash
pnpm test test/continue.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 3: Commit**

```bash
git add lib/continue.ts test/continue.test.ts
git commit -m "feat(plugin): add /migrate:continue resume logic"
```

---

## Task 25: Wire discover into the continue dispatcher table — integration test

**Files:**
- Modify: `lib/continue.ts`
- Create or Modify: `test/continue-discover.integration.test.ts`

- [ ] **Step 1: Add a default dispatcher table**

Append to `lib/continue.ts`:
```typescript
import { runDiscover } from "./discover.ts";

export function defaultDispatchers(): Record<string, PhaseDispatcher> {
  return {
    "phase-1-discover": async ({ targetDir, runDir }) => {
      await runDiscover({ targetDir, runDir });
    },
  };
}
```

- [ ] **Step 2: Add an integration test**

Create `test/continue-discover.integration.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "node:http";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import getPort from "get-port";
import { resumeMigration } from "../lib/continue.ts";
import { runDiscover } from "../lib/discover.ts";
import { bootstrapMigration } from "../lib/bootstrap.ts";

const fixtureDir = fileURLToPath(new URL("./fixtures/site-fixture/", import.meta.url));
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const port = await getPort();
  server = createServer((req, res) => {
    const url = req.url === "/" ? "/index.html" : req.url!.split("?")[0];
    const file = url === "/robots.txt" ? "robots.txt" : `${url.replace(/^\//, "").replace(/\/$/, "")}.html`;
    const path = join(fixtureDir, file === ".html" ? "index.html" : file);
    if (!existsSync(path)) { res.statusCode = 404; res.end("nope"); return; }
    res.setHeader("Content-Type", file.endsWith(".html") ? "text/html" : "text/plain");
    res.end(readFileSync(path, "utf8"));
  });
  await new Promise<void>(r => server.listen(port, r));
  baseUrl = `http://127.0.0.1:${port}`;
});
afterAll(() => new Promise<void>(r => server.close(() => r())));

describe("continue → discover end-to-end", () => {
  it("runs phase-1-discover and produces verified crawl.json", async () => {
    const root = mkdtempSync(join(tmpdir(), "e2e-"));
    await bootstrapMigration({
      targetDir: root,
      site: {
        sourceUrl: baseUrl + "/", target: "./",
        mode: "unattended", goal: "wireframe", inputMode: "url-only",
        maxParallelPages: 4, maxParallelSections: 4,
      },
    });
    const dispatchers = {
      "phase-1-discover": async ({ targetDir, runDir }: { targetDir: string; runDir: string }) => {
        await runDiscover({
          targetDir, runDir,
          probeOne: async (url) => ({
            url, matchedAdapters: ["static-html"], recommendation: "DIRECT_EXTRACTION",
            detectedCMP: null, spaAnalysis: { isSPA: false },
          }),
        });
      },
    };
    const result = await resumeMigration(root, { dispatchers });
    expect(result.kind).toBe("dispatched");
    if (result.kind === "dispatched") expect(result.phase).toBe("phase-1-discover");
    expect(existsSync(join(root, ".migration/runs/001-initial/phase-1-discover/discovery/crawl.json"))).toBe(true);
    expect(existsSync(join(root, ".migration/runs/001-initial/phase-1-discover/VERIFICATION.md"))).toBe(true);
  });
});
```

- [ ] **Step 3: Run test**

```bash
pnpm test test/continue-discover.integration.test.ts
```

Expected: PASS (1 test).

- [ ] **Step 4: Commit**

```bash
git add lib/continue.ts test/continue-discover.integration.test.ts
git commit -m "feat(plugin): wire phase-1-discover into continue dispatcher"
```

---

## Task 26: CLI shims for discover + continue

**Files:**
- Modify: `lib/discover.ts` (add CLI shim)
- Modify: `lib/continue.ts` (add CLI shim)

- [ ] **Step 1: Append CLI shim to lib/discover.ts**

Append:
```typescript
if (import.meta.url === `file://${process.argv[1]}`) {
  const get = (flag: string) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const targetDir = get("--target") ?? process.cwd();
  const runDir = get("--run") ?? "001-initial";
  const confirmPageList = process.argv.includes("--confirm-page-list");
  const confirmAborts = process.argv.includes("--confirm-aborts");
  runDiscover({ targetDir, runDir, confirmPageList, confirmAborts })
    .then(() => { console.log(`Discover phase complete for run ${runDir}.`); })
    .catch(err => { console.error(err.message); process.exit(1); });
}
```

- [ ] **Step 2: Append CLI shim to lib/continue.ts**

Append:
```typescript
if (import.meta.url === `file://${process.argv[1]}`) {
  const get = (flag: string) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const targetDir = get("--target") ?? process.cwd();
  resumeMigration(targetDir, { dispatchers: defaultDispatchers() })
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      if (result.kind === "no-dispatcher") process.exit(2);
    })
    .catch(err => { console.error(err.message); process.exit(1); });
}
```

- [ ] **Step 3: Re-run lib tests to confirm shims do not break imports**

```bash
pnpm test test/continue.test.ts test/discover.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/discover.ts lib/continue.ts
git commit -m "feat(plugin): add CLI shims for discover and continue"
```

---

## Task 27: site-crawler agent prompt

**Files:**
- Create: `agents/site-crawler.md`

- [ ] **Step 1: Write the agent prompt**

Create `agents/site-crawler.md`:
```markdown
---
name: site-crawler
description: Phase 1 main agent. Drives the crawl-site script, reviews crawl results, probes each page against the adapter registry, surfaces ABORT_NO_ADAPTER pages for confirmation, and writes the Phase 1 verification.
---

# Site Crawler Agent

You are running Phase 1 (Discover) of a Next.js migration. Your goal is to produce a confirmed, schema-valid `discovery/crawl.json` and `discovery/probe.json`, plus a passing `VERIFICATION.md`.

## Inputs

- **Target directory** — the user project root (parent of `.migration/`).
- **Active run** — e.g., `001-initial` (already created by `/migrate:new`).
- **SITE.md** — read `${target}/.migration/SITE.md` for `sourceUrl`, `mode`, `goal`.

## Tools

You drive the discover phase by running the plugin's TypeScript entry script. Do NOT crawl pages yourself with browser automation — that is the script's job.

```bash
tsx ${PLUGIN_DIR}/lib/discover.ts \
  --target "${TARGET_DIR}" \
  --run "${RUN_DIR}"
```

Add `--confirm-page-list` and/or `--confirm-aborts` only after you have explicit user confirmation (see below).

## Step-by-step

### 1. Run the initial discover pass

Invoke the script without confirmation flags. It writes:
- `runs/${RUN_DIR}/phase-1-discover/PLAN.md`
- `runs/${RUN_DIR}/phase-1-discover/EXECUTION.md`
- `runs/${RUN_DIR}/phase-1-discover/discovery/crawl.json`
- `runs/${RUN_DIR}/phase-1-discover/discovery/probe.json`
- `runs/${RUN_DIR}/phase-1-discover/verification.json` (always)
- `runs/${RUN_DIR}/phase-1-discover/VERIFICATION.md` (only if the gate passes)

### 2. Read the verification.json to find what's blocking the gate

The two gate criteria you may need to clear are:

- **`every page has matched adapter or confirmed ABORT`** — failed if any page has `recommendation: "ABORT_NO_ADAPTER"` and the user has not yet confirmed. List those URLs to the user, briefly explain why each was unmatched (drawn from `probe.json[].matchedAdapters` length 0 + `detectedCMP` + `isSPA`), and ask: "Skip these N pages? (yes / no — provide an adapter name)".
- **`user confirmed page list`** — in attended mode this requires explicit user confirmation. Print the discovered page list (URL + slug + depth) and ask: "Proceed with these N pages? (yes / no — edit list)".

In **unattended mode**, the page-list gate auto-confirms; you only need to handle ABORT pages by accepting the default (skip) and noting it in `EXECUTION.md`.

### 3. Re-run with confirmation flags

Once the user has answered, invoke discover again with the appropriate flags:

```bash
tsx ${PLUGIN_DIR}/lib/discover.ts \
  --target "${TARGET_DIR}" --run "${RUN_DIR}" \
  --confirm-page-list \
  --confirm-aborts        # only if user said skip
```

This rewrites `crawl.json` (idempotently — same crawl) and re-emits a passing `VERIFICATION.md`.

### 4. Auto-repair for invalid JSON

If `loadCrawl` or `loadProbe` returns `valid: false`, the lib raises `UnrepairableStateError` after 3 dispatched repairs. When you see a state-repair dispatch happen, hand off to the `state-repairer` agent with the diagnostic and `schemas/crawl.ts` (or `schemas/probe.ts`) attached.

## Failure modes

- **Crawl returns 0 pages.** Likely robots.txt blanket-disallow or DNS failure. Surface the `crawl.json.errors` array and stop.
- **All pages ABORT_NO_ADAPTER.** Likely an unsupported platform. Tell the user and stop — do not auto-confirm.
- **probe.json schema fails repeatedly.** Stop with the `state-repairer` diagnostic; this is a plugin-side bug, not a user issue.

## You MUST NOT

- Modify SITE.md
- Write to any `phase-N-*` other than phase-1-discover
- Skip the page-list gate in attended mode without user input
- Invoke any other phase
```

- [ ] **Step 2: Commit**

```bash
git add agents/site-crawler.md
git commit -m "feat(plugin): add site-crawler agent prompt"
```

---

## Task 28: Generic phase-executor and phase-verifier agent prompts

**Files:**
- Create: `agents/phase-executor.md`
- Create: `agents/phase-verifier.md`

- [ ] **Step 1: phase-executor prompt**

Create `agents/phase-executor.md`:
```markdown
---
name: phase-executor
description: Generic phase executor. Reads a phase dir's PLAN.md, drives the work, and writes EXECUTION.md as steps complete. Hands off to phase-verifier for the gate.
---

# Phase Executor Agent

You execute the work for a single phase. You are NOT phase-specific — your inputs are the phase dir and the PLAN.md it contains.

## Inputs

- `phaseDir` — absolute path to e.g. `runs/001-initial/phase-1-discover/`
- `runDir` — e.g. `001-initial`
- `targetDir` — user project root

## What you do

1. Read `${phaseDir}/PLAN.md`. Each top-level `## Step` heading is a discrete unit of work with concrete commands. Run them in order.
2. After each step, append a timestamped entry to `${phaseDir}/EXECUTION.md` summarizing what ran, exit code, and any output worth keeping (e.g., file paths produced).
3. If a step's command writes a state JSON file, after writing call the matching loader (`loadCrawl`, `loadProbe`, etc.). On `valid: false`, dispatch `state-repairer` with the diagnostic. On `UnrepairableStateError`, stop and surface the diagnostic to the user.
4. When all steps are complete, dispatch `phase-verifier` for this phase dir.

## You MUST NOT

- Decide whether the gate passes. That's `phase-verifier`'s job.
- Write `VERIFICATION.md` directly. The lib's `writeVerification` does that, gated on `passed: true`.
- Move on to the next phase. `/migrate:continue` is the orchestrator.
```

- [ ] **Step 2: phase-verifier prompt**

Create `agents/phase-verifier.md`:
```markdown
---
name: phase-verifier
description: Generic goal-backward phase verifier. Reads a phase dir's PLAN.md goal statement, checks the artifacts in the dir against it, writes verification.json, and emits VERIFICATION.md only on pass.
---

# Phase Verifier Agent

You decide whether a phase's gate is satisfied. You operate per spec § 5 — each phase's "Verification gate" column is the contract.

## Inputs

- `phaseDir` — absolute path
- `phase` — the phase id (e.g., `phase-1-discover`)

## Per-phase gate criteria

| Phase | Criteria |
|---|---|
| phase-1-discover | crawl.json valid; probe.json valid; every page has matched adapter or explicit ABORT_NO_ADAPTER user-confirmed; user confirmed page list (unless mode: unattended) |
| phase-2-analyze | (Plan 3) |
| phase-3-plan | (Plan 3) |
| phase-4-extract | (Plan 4) |
| phase-5-build | (Plan 4) |

## Output

Always write `${phaseDir}/verification.json` via the `writeVerification` helper. Library-side, that helper writes `VERIFICATION.md` only when `passed: true`. Do NOT write VERIFICATION.md by hand.

## You MUST NOT

- Re-run phase work. If a criterion fails, surface why and exit. The user / `/migrate:verify` re-runs the phase if needed.
```

- [ ] **Step 3: Commit**

```bash
git add agents/phase-executor.md agents/phase-verifier.md
git commit -m "feat(plugin): add phase-executor and phase-verifier agent prompts"
```

---

## Task 29: /migrate:discover skill + command

**Files:**
- Create: `commands/migrate-discover.md`
- Create: `skills/migrate-discover/SKILL.md`

- [ ] **Step 1: Command**

Create `commands/migrate-discover.md`:
```markdown
---
name: migrate:discover
description: Explicitly run Phase 1 (Discover) for the active run.
---

Invoke the `migrate-discover` skill.
```

- [ ] **Step 2: Skill**

Create `skills/migrate-discover/SKILL.md`:
```markdown
---
name: migrate-discover
description: Run Phase 1 (Discover) — crawl the source URL, probe each page, gate on user confirmation + adapter matches.
---

# /migrate:discover

You are running Phase 1 explicitly. Delegate to the `site-crawler` agent for the actual work.

## Step 1 — Verify preconditions

Read `.migration/SITE.md`. If it does not exist, abort with: "No migration in this directory. Run `/migrate:new <url>`."

If `runs/001-initial/phase-1-discover/VERIFICATION.md` already exists, ask the user: "Phase 1 already verified. Re-run? (yes / no)" — abort on no.

## Step 2 — Dispatch site-crawler

Dispatch the `site-crawler` agent with:
- `targetDir` = `${PWD}`
- `runDir` = the active run dir name (latest under `.migration/runs/`, default `001-initial`)

The agent owns: running the script, reading verification.json, asking the page-list and ABORT confirmations in attended mode, re-running with `--confirm-page-list` / `--confirm-aborts`, and dispatching `state-repairer` on Zod failures.

## Step 3 — Report

When the agent returns, summarize:

> Discover complete: N pages crawled, M pages with matched adapter, K pages flagged ABORT.
> Run `/migrate:status` to see overall state, or `/migrate:continue` to proceed to Phase 2.

If the gate did not pass, surface the failing criteria from `verification.json` and stop.
```

- [ ] **Step 3: Commit**

```bash
git add commands/migrate-discover.md skills/migrate-discover/SKILL.md
git commit -m "feat(plugin): add /migrate:discover skill and command"
```

---

## Task 30: /migrate:continue skill + command

**Files:**
- Create: `commands/migrate-continue.md`
- Create: `skills/migrate-continue/SKILL.md`

- [ ] **Step 1: Command**

Create `commands/migrate-continue.md`:
```markdown
---
name: migrate:continue
description: Auto-resume to the first incomplete phase. Daily driver.
---

Invoke the `migrate-continue` skill.
```

- [ ] **Step 2: Skill**

Create `skills/migrate-continue/SKILL.md`:
```markdown
---
name: migrate-continue
description: Resume the active migration at the first phase missing VERIFICATION.md.
---

# /migrate:continue

You are the orchestrator. You do NOT do phase work yourself — you find the next phase and delegate.

## Step 1 — Resolve next phase

Run:

```bash
tsx ${PLUGIN_DIR}/lib/continue.ts --target "${PWD}"
```

The script prints a JSON result. Read its `kind`:

- `not-initialized` — print: "No migration here. Run `/migrate:new <url>`."
- `all-done` — print: "All phases complete for run [runDir]. Run `/migrate:ship` for the final report."
- `dispatched` — the script already ran the registered dispatcher (currently only `phase-1-discover`). Print the result and stop. The user can run `/migrate:continue` again to proceed once the gate passes.
- `no-dispatcher` — the next phase has no library-level dispatcher yet (Plans 3–5). Print which phase is next and ask the user: "Run `/migrate:[next-phase]` manually, or skip to a later phase."

## Step 2 — In unattended mode, loop

If `SITE.md` has `mode: unattended` AND the result was `dispatched`, immediately re-invoke `/migrate:continue` (use the `superpowers:dispatching-parallel-agents` pattern only when the next phase fans out — phase 1 does not). Stop on `all-done`, `no-dispatcher`, or any failed gate.

In attended mode, do not auto-loop. Print and yield control.

## You MUST NOT

- Skip the verification gate. If the dispatched phase did not produce `VERIFICATION.md`, the gate failed — read the `verification.json` failed criteria and surface them to the user.
- Mutate `SITE.md`.
```

- [ ] **Step 3: Commit**

```bash
git add commands/migrate-continue.md skills/migrate-continue/SKILL.md
git commit -m "feat(plugin): add /migrate:continue skill and command"
```

---

## Task 31: /migrate:verify skill + command

**Files:**
- Create: `commands/migrate-verify.md`
- Create: `skills/migrate-verify/SKILL.md`

- [ ] **Step 1: Command**

Create `commands/migrate-verify.md`:
```markdown
---
name: migrate:verify
description: Re-run the verification gate for the current phase (or a specific phase).
arguments:
  - name: phase
    description: Optional phase id, e.g., "phase-1-discover". Defaults to first incomplete phase in active run.
    required: false
---

Invoke the `migrate-verify` skill.
```

- [ ] **Step 2: Skill**

Create `skills/migrate-verify/SKILL.md`:
```markdown
---
name: migrate-verify
description: Re-evaluate the gate for a phase without re-running the work. Reads phase artifacts and rewrites verification.json.
---

# /migrate:verify [phase]

Re-check the gate for a single phase. Useful after the user has manually edited an artifact (e.g., trimmed `crawl.json` page list) or confirmed a flagged page.

## Step 1 — Resolve target phase

If the user supplied a phase id, use it. Otherwise read the first incomplete phase via:

```bash
tsx ${PLUGIN_DIR}/lib/continue.ts --target "${PWD}"
```

(Use the `phase` field of the JSON output.)

## Step 2 — Re-run the phase's verifier

For `phase-1-discover`, dispatch the `site-crawler` agent with explicit instructions: "Do not re-crawl. Re-read crawl.json and probe.json, ask user for any missing confirmations, and re-emit verification.json."

Concretely the agent invokes:

```bash
tsx ${PLUGIN_DIR}/lib/discover.ts \
  --target "${PWD}" --run "${RUN_DIR}" \
  --confirm-page-list --confirm-aborts
```

The discover driver is idempotent on re-run: it will overwrite the crawl artifacts with a fresh crawl, which is the correct behavior — partial confirmation should not freeze a stale crawl. If you want a true verify-only mode that skips the crawl, exit with: "Verify-only mode is not yet implemented for Phase 1; run `/migrate:discover` to re-crawl."

## Step 3 — Report the new gate result

If `VERIFICATION.md` now exists, print: "Phase [phase-id] verified."
Otherwise, print the failed criteria from `verification.json` and exit.
```

- [ ] **Step 3: Commit**

```bash
git add commands/migrate-verify.md skills/migrate-verify/SKILL.md
git commit -m "feat(plugin): add /migrate:verify skill and command"
```

---

## Task 32: Knowledge — discover phase pitfalls

**Files:**
- Create: `knowledge/phase-pitfalls/discover.md`

- [ ] **Step 1: Write the pitfalls file**

Create `knowledge/phase-pitfalls/discover.md`:
```markdown
# Phase 1 (Discover) — pitfalls

## Crawler

- **Trailing-slash collisions.** `/about` and `/about/` are the same page. `crawl-site.ts` normalizes by stripping trailing slashes from non-root paths.
- **Hash + query strip is intentional.** `?ref=foo` and `#section` do not produce new pages. If a site uses query strings as primary navigation (some Bubble apps), expect missing pages — this is a v2 problem.
- **External redirects.** A 30x to a different origin counts as off-site and is not followed. Same-origin redirects are followed and the final URL is the one stored.
- **robots.txt is fetched once.** Per-page Disallow is not honored at granular User-agent rules — only `User-agent: *` Disallow lines.
- **JS-rendered links.** Playwright extracts links via `a[href]` after `domcontentloaded`. Sites that mount nav post-DCL (some React apps) will see a partial graph. The probe phase will detect SPA and recommend `SPA_FLOW_EXTRACTION` — but only for the seed URL since deeper URLs were never discovered. Workaround: pass them via `/migrate:add-pages` once you know them.

## Probe → adapter matching

- **Multiple matched adapters.** A page can match e.g. both `webflow` and `wordpress-elementor` if signals overlap. The first array element wins downstream; surface the full list to the user.
- **CMP detection ≠ adapter.** A `detectedCMP: "OneTrust"` finding is informational; the cookie banner is dismissed at extraction time, not here.
- **Empty `matchedAdapters` is not always fatal.** A `static-html` adapter is the default fallback for plain-HTML sites. If probe returns empty for a page that's clearly hand-rolled HTML, it's a probe-script bug, not a missing-adapter situation.

## Gate

- **Unattended mode auto-confirms the page list but NOT ABORTs.** This is intentional. ABORT pages need an explicit user decision the first time; subsequent runs use the recorded confirmation.
- **`VERIFICATION.md` is never written when `passed: false`.** The presence of `VERIFICATION.md` is the system's only signal that the gate passed; do not write it by hand.
- **`verification.json` is always written.** Even on fail. That's where you read failed-criteria detail from.
```

- [ ] **Step 2: Commit**

```bash
git add knowledge/phase-pitfalls/discover.md
git commit -m "docs(plugin): add Phase 1 (Discover) pitfalls knowledge file"
```

---

## Task 33: Final verification — full test + typecheck + smoke

- [ ] **Step 1: Run the full test suite**

```bash
pnpm test
```

Expected: All previous Plan 1 tests still pass (~57). New Plan 2 tests pass:
- `slug.test.ts` — 6
- `crawl-schema.test.ts` — 5
- `load-crawl.test.ts` — 2
- `probe-schema.test.ts` — 3
- `load-probe.test.ts` — 2
- `load-with-repair.test.ts` — 4
- `phase-state.test.ts` — 5
- `phase-status.test.ts` — 5
- `crawl-runner.test.ts` — 3
- `probe-runner.test.ts` — 2
- `discover.test.ts` — 4
- `continue.test.ts` — 4
- `continue-discover.integration.test.ts` — 1

Total new: ~46. Combined: ~103 passing.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: exits 0.

- [ ] **Step 3: Manual smoke against the in-process fixture site**

```bash
mkdir /tmp/discover-smoke
cd /tmp/discover-smoke
# Bootstrap with a public test site or your own fixture
tsx ~/.../nextjs-migration-plugin/lib/new-migration.ts \
  --url "https://example.com" \
  --target "/tmp/discover-smoke" \
  --mode unattended \
  --goal wireframe \
  --input-mode url-only

tsx ~/.../nextjs-migration-plugin/lib/continue.ts --target "/tmp/discover-smoke"
```

Expected: a `kind: "dispatched"` JSON result, plus the following files under `/tmp/discover-smoke/.migration/runs/001-initial/phase-1-discover/`:
- `PLAN.md`
- `EXECUTION.md`
- `verification.json` (always)
- `VERIFICATION.md` (only if every example.com page resolved to a matched adapter — for `example.com` it likely will not, since static-html is conservative; expect failed gate, which is a correct outcome to observe)
- `discovery/crawl.json`
- `discovery/probe.json`

If the gate failed, read `verification.json` and confirm the failed criterion is `every page has matched adapter or confirmed ABORT`. That is the expected unattended-mode signal that user confirmation is required.

- [ ] **Step 4: Commit any smoke-driven fixes**

If the smoke test surfaces issues (e.g., `tsx` resolution from a child process, Playwright launch failure), fix them and commit with `fix(plugin): [specific issue]`.

- [ ] **Step 5: Tag v0.0.2**

```bash
git tag v0.0.2
```

Do not push. Tag locally as the Plan 2 checkpoint.

---

## Self-review — spec coverage

Mapping spec § 5 (Phase 1) and § 9 (`/migrate:continue`, `:discover`, `:verify`) to tasks:

| Spec requirement | Task(s) |
|---|---|
| § 5 row 1: site-crawler agent | 27 |
| § 5 row 1: `discovery/crawl.json` artifact | 4-7, 17-18, 22 |
| § 5 row 1: `discovery/probe.json` artifact | 8-10, 19-20, 22 |
| § 5 row 1 gate: user confirms page list | 21-22 (criterion + flag) |
| § 5 row 1 gate: adapter matched OR explicit ABORT | 21-22 (criterion + flag) |
| § 5 phase preconditions check (skill) | 29 |
| § 7 state-file Zod validation at read time | 5, 7, 9, 10 |
| § 7 state auto-repair flow (3 attempts) | 11-12 |
| § 7 state-repairer agent | 13 |
| § 9 `/migrate:continue` resume | 23-26, 30 |
| § 9 `/migrate:discover` explicit invocation | 26, 29 |
| § 9 `/migrate:verify` re-evaluation | 31 |
| § 12 unattended mode auto-loop | 30 (skill behavior) |
| § 8 phase-pitfalls per-phase doc | 32 |
| § 10 phase-executor / phase-verifier generics | 28 |

**Deferred to later plans (per the 5-plan split):**
- Phases 2–5 (Plans 3–4)
- Polish phases 6–8 + `/migrate:polish` + `/migrate:add-pages` (Plan 5)
- Sitemap.xml ingestion (a v2 nicety; Phase 1 currently sets `sitemapUrls: []`)
- Granular per-User-agent robots.txt parsing (current code only honors `*`)
- True verify-only path that skips re-crawl (Plan 3 will revisit `/migrate:verify` once additional phases are wired)

**Type / name consistency check:**
- `LoadResult<T>.data` (renamed from `.adapter` in Task 7) is used uniformly by `loadAdapter`, `loadCrawl`, `loadProbe`. The adapter test was updated to match.
- `PhaseDispatcher` signature `({ targetDir, runDir }) => Promise<void>` is used by both `defaultDispatchers()` and the test stubs in Tasks 23, 25.
- `runDiscover` arg names match in Tasks 21, 22, 25, 26 (CLI shim).
- Phase-id strings (`phase-1-discover` etc.) match across `phase-status.ts`, `discover.ts`, the integration test, the agent prompts, and the spec.
- `ProbedPage.recommendation` enum matches `scripts/probe-page.ts`'s known values per the spec (`DIRECT_EXTRACTION`, `SPA_FLOW_EXTRACTION`, `ABORT_NO_ADAPTER`).

No TBD placeholders. Every code-modifying step shows the code.

## Ready for execution

Plan complete and saved to `docs/superpowers/plans/2026-04-29-phase-1-discover.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch with checkpoints

Which approach?
