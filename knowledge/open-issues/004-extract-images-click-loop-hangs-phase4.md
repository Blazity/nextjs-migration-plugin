# ISSUE-004: extract-images.ts click loop hangs Phase 4 indefinitely on CMS nav

**Surfaced by:** Phase 4 (Extract)
**Severity:** High — phase wedges with no progress and no error output. All `maxParallelPages` workers lock simultaneously when site uses CMS-rendered nav (Webflow, Wix, etc.). User must manually `pkill` Chromium to recover.
**Status:** Open

## Evidence pattern

`migrate:extract` runs, completes a few pages, then stops emitting log lines. Process tree shows:

- `N` × `tsx scripts/extract-images.ts` parent processes alive (one per page in the in-flight batch)
- Each parent has 5–6 `chrome-headless-shell` children (renderer, gpu-process, network, utility) at near-zero CPU
- Wall-clock time since launch grows; CPU time per renderer plateaus around 10–20s and never advances
- `extraction/manifest.json` does NOT exist; per-page `pages/<slug>/manifest.json` does NOT exist for the stuck pages
- `pages/<stuck-slug>/spec/` contains `styles.json` and `00-globals.json` but NOT `images.json` (styles step finished, images step hung)

Concurrency is exactly `siteResult.site.maxParallelPages` stuck workers — workers never release their slot, so the queue never advances past the initial batch.

## Root cause

Two compounding bugs combine into an unrecoverable hang.

### Bug A — `scripts/lib/extract-images-core.ts` lines 1152–1257

The `expandedTriggers` loop iterates every nav-trigger candidate found in the section's shell, clicks it, then awaits `requestAnimationFrame` × 2 to let the menu open:

```ts
for (const trigger of candidates) {
  // ...
  ;(trigger as HTMLElement).click()
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  // ... collect expanded items ...
  ;(trigger as HTMLElement).click()
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}
```

Three failure modes for the awaited rAF promise — none has a timeout:

1. **Click triggers same-origin navigation.** If the trigger is an `<a>` whose `href` filter on lines 1058–1066 doesn't catch a real URL (e.g., a `role="button"` anchor with `href="/products"`, or any anchor that matches the keyword regex on lines 1071), `click()` navigates the page. The execution context is destroyed mid-evaluate. The pending `Promise` never resolves — Playwright's in-page async eval just hangs.
2. **rAF throttling in headless Chromium.** When the page becomes hidden / occluded / off-screen / has no compositor surface, Chromium can throttle `requestAnimationFrame` callbacks to ≥1s or pause them entirely. Two stacked rAFs in a loop body across many triggers compound into multi-minute waits per page.
3. **Click opens a modal/overlay that captures input.** Some Webflow nav patterns open a fullscreen drawer that re-renders the trigger off-screen. The follow-up `(trigger).click()` to close hits a stale node; the drawer stays open; the rAF wait never advances because the next iteration runs against a detached element.

There is no `Promise.race` timeout, no `try/catch`, no per-trigger budget. One bad trigger hangs the whole script.

### Bug B — `lib/extract-runner.ts` lines 120–145

The three default extract steps invoke subprocesses with `execFileP` and **no `timeout` option**:

```ts
await execFileP("npx", ["tsx", script, url, outputDir, "--adapter", adapterPath], { env: process.env });
```

Default `child_process.execFile` timeout is 0 (unlimited). When Bug A wedges `extract-images.ts`, `execFileP` waits forever. The wrapping `extractPage()` call in `lib/extract.ts:101` never returns. The bounded-concurrency worker holds its slot indefinitely. With `maxParallelPages = 4`, four hangs lock all four slots — the queue never drains.

## Reproduction

1. Run plugin against a Webflow site with multi-level nav (e.g., the demo `https://blazity.com/`)
2. Drive Phase 4 with default `maxParallelPages` ≥ 2
3. Within 15–60 seconds, log lines stop arriving
4. `ps aux | grep chrome-headless-shell | wc -l` will show ~6× `maxParallelPages` processes idle at ~0% CPU
5. No timeout fires — the orchestrator never gives up on its own

## Proposed fix

Three layers, defense in depth:

### 1. Per-trigger timeout in the click loop (Bug A primary fix)

Wrap each click + rAF await in a 5s race inside the in-page `evaluate` block (race must run inside the eval since Playwright's eval boundary already protects against navigation, but the inner Promise still has to resolve for the eval to return):

```ts
const raceWithTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("trigger-click-timeout")), ms)),
  ])

try {
  ;(trigger as HTMLElement).click()
  await raceWithTimeout(
    new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))),
    5000,
  )
} catch {
  continue // skip this trigger, keep going
}
```

Apply to both the open-click and the close-click. `setTimeout` survives rAF throttling in Chromium because it runs on the timer thread, not the compositor thread.

### 2. Skip nav-trigger expansion when click would navigate (Bug A secondary)

Before clicking, check the trigger's effective href:

```ts
const willNavigate =
  trigger.tagName.toLowerCase() === "a"
  && (trigger as HTMLAnchorElement).href
  && !["#", "", trigger.ownerDocument.location.href].includes((trigger as HTMLAnchorElement).href)
if (willNavigate) continue
```

`<button>` and pure `role="button"` anchors stay in scope; navigational anchors are skipped. Webflow's "Services" nav link is exactly the case this catches.

### 3. Subprocess timeout in extract-runner (Bug B + safety net)

Add `timeout: 180_000` (3 min) and `killSignal: "SIGKILL"` to all three `execFileP` calls in `lib/extract-runner.ts`:

```ts
await execFileP("npx", ["tsx", script, url, outputDir, "--adapter", adapterPath], {
  env: process.env,
  timeout: 180_000,
  killSignal: "SIGKILL",
})
```

When fix 1 + 2 are correct, this never fires. When the page has some other Playwright pathology (memory leak, infinite-scroll site, custom adapter regression), the worker still releases its slot and the page is recorded in `extractFailures`. `extract.ts` already gathers failures into `extraction/failures.json` — that path becomes useful instead of dead code.

## Recovery procedure (until fixed)

1. `pkill -9 -f "extract-images.ts"; pkill -9 -f "chrome-headless-shell"`
2. Re-run `migrate:continue`. Note: `lib/extract.ts:101` always re-invokes `extractOne()` — it does not skip pages with an existing `manifest.json`. Partial spec files are overwritten on next run; safe to retry, but every page re-extracts from scratch.
3. To skip already-completed pages on retry, add a manifest-existence guard in `lib/extract.ts:90-128` worker loop (out of scope for this ticket but worth noting — track separately if user requests).

## Action items

- [ ] Patch `scripts/lib/extract-images-core.ts` lines 1152–1257 with per-trigger 5s timeout race + navigation-anchor skip
- [ ] Patch `lib/extract-runner.ts` lines 120–145 to set `timeout: 180_000`, `killSignal: "SIGKILL"` on all three `execFileP` calls
- [ ] Add regression test in `test/extract-runner.test.ts`: a stub `runImages` that never resolves should cause `extractPage` to throw within the configured timeout, not hang the test runner
- [ ] Add regression test in `test/extract-images.test.ts` (or core-level test): `expandedTriggers` loop with a synthetic navigation-anchor candidate should not invoke click on it
- [ ] Document the navigation-anchor pitfall + subprocess-timeout pattern in `knowledge/phase-pitfalls/extract.md`
- [ ] Optionally: skip-if-manifest-exists in `lib/extract.ts` worker for cheap resumability after partial runs
