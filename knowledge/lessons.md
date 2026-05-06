# Lessons

Read this file at the start of every session. Append new entries when you discover a pitfall.

---

### 1. LLMs cannot translate screenshots to CSS

**Platform:** Universal
**Context:** Three rounds of screenshot-based visual parity attempts on the blazity.com homepage.
**Problem:** Claude was given screenshots and asked to write matching CSS. It hallucinated spacing, guessed font sizes, and made superficial changes (e.g., switching background from dark to light). ~200k tokens spent with minimal visual improvement — diffs remained 24-62%.
**Rule:** Never use screenshots as implementation input. Extract exact computed styles from the DOM into structured JSON specs. The AI reads numeric values and maps them deterministically to Tailwind classes. Screenshots are only used for verification after implementation.

### 2. Webflow DOM has no `<main>` element

**Platform:** Webflow
**Context:** Writing the initial style extraction script for blazity.com.
**Problem:** The script used `nav, main > *, footer` as the section selector. Webflow puts all sections as direct `<body>` children — no `<main>` wrapper. The script found only 5 elements (navbar + 3 dropdown lists + footer) instead of the expected 12 sections.
**Rule:** For Webflow sites, use `body > *` filtered by `height > 10px` and excluding `script`, `noscript`, `style`, `link` tags. Always verify section count matches the live site before trusting extraction output.
**Recovery:** Updated selector to `body > *` with height/tag filtering. Re-ran extraction and got all 12 sections.

### 3. Lazy-loaded images need scroll before extraction

**Platform:** Universal
**Context:** First run of the image extraction script on blazity.com.
**Problem:** Case study section returned 0 images. The card screenshots use `loading="lazy"` and hadn't loaded because the script never scrolled down to trigger them. 6 images were missed entirely.
**Rule:** Before extracting images, scroll the full page height in 500px increments with 200ms pauses between scrolls. Then scroll back to top and wait 1s before starting extraction.
**Recovery:** Added scroll loop to `extract-images.ts`. Re-ran and captured all 31 images including the lazy-loaded ones.

### 4. Project uses pnpm, not npm

**Platform:** Universal
**Context:** Installing dev dependencies (Playwright, pixelmatch, tsx).
**Problem:** `npm install` failed with `Cannot read properties of null (reading 'matches')` — an arborist error caused by pnpm's symlinked `node_modules/.pnpm/` structure.
**Rule:** Check for `pnpm-lock.yaml` before running any install command. Use `pnpm add` / `pnpm add -D` instead of `npm install`.

### 5. Section-level verification, not full-page

**Platform:** Universal
**Context:** BackstopJS was configured for full-page screenshot comparison across 13 pages.
**Problem:** All 13 pages failed with 24-62% mismatch. A single missing section shifts everything below it, cascading the diff into every subsequent section. A footer-only bug looks like a 13-section failure.
**Rule:** Always compare section-by-section. Playwright clips a screenshot of each section individually, then compares against the corresponding section on the reference site. One broken section only fails itself. Use `scripts/verify-visual.ts` which implements this approach.

### 6. Missing images are the biggest diff source

**Platform:** Universal
**Context:** First implementation pass had spec-driven CSS applied to all sections.
**Problem:** Sections with images (Hero 35%, Case Studies 52%, Community 61%) had huge diffs despite correct styling. Images occupy more visual area than text — a missing card screenshot causes more pixel diff than wrong padding.
**Rule:** Extract and place all images before fine-tuning CSS. Run `scripts/extract-images.ts` first. Check `image-manifest.json` for every section's images before implementing.

### 7. Extraction selectors are site-specific

**Platform:** Universal
**Context:** The extraction script uses DOM selectors to identify page sections.
**Problem:** Webflow uses class patterns like `section_*`, `navbar_component`, `section-footer`. A Next.js site uses `main > *`. WordPress would use different patterns entirely. The same script won't work across platforms without selector adjustment.
**Rule:** After running extraction, verify the section count and labels match the live site. If they don't, inspect the DOM structure (use Playwright's `body.children` dump) and adjust the selector. Document platform-specific selectors in lessons.

### 8. Webflow IX2 animation data is accessible via JS

**Platform:** Webflow
**Context:** Extracting animation data from blazity.com.
**Problem:** Initially assumed animations would need to be reverse-engineered from visual observation.
**Rule:** Webflow stores all interaction definitions in `window.__wf_ix2` (or `Webflow.require("ix2")`). This contains trigger types, target selectors, keyframes, easing curves, duration, and delay. The extraction script saves this as `ix2-animations.json` — 29k lines from the homepage alone. Map IX2 triggers to Framer Motion equivalents (scroll-into-view → `whileInView`, page-load → `animate`).

### 9. Hover extraction needs mouse reset

**Platform:** Universal
**Context:** Extracting hover state diffs for buttons and links.
**Problem:** After calling `element.hover()`, computed styles stay in the hover state. Subsequent element reads on nearby elements can return contaminated values if the mouse hasn't moved away.
**Rule:** After capturing hover styles for an element, move the mouse to `(0, 0)` and wait 200ms before proceeding to the next element. This ensures the previous element's hover state has fully reset.

### 10. Webflow CDN blocks some background-image URLs

**Platform:** Webflow
**Context:** Downloading CSS `background-image` assets from blazity.com.
**Problem:** Some `background-image` URLs on `cdn.prod.website-files.com` return HTTP 403 when fetched directly. Regular `<img>` src URLs from the same CDN work fine.
**Rule:** For blocked CSS background images, use alternative approaches: embed YouTube iframes directly for video thumbnails, or capture the element via Playwright screenshot as a fallback image. Do not retry or attempt to bypass the 403.

### 11. Cookie consent dialogs inflate all visual diffs

**Platform:** Universal
**Context:** Running section-level visual verification between blazity.com and localhost.
**Problem:** The local site's cookie consent dialog (shadcn Dialog) appeared in every screenshot, overlaying ~400x350px on each section. The verification script dismissed blazity.com's banner but not the local one. All sections showed 10-20% inflated diffs from this single cause.
**Rule:** Before screenshotting the local site, set the consent cookie to suppress the dialog. For this project: `document.cookie = "cookie-consent=" + JSON.stringify({necessary:true,analytics:true,marketing:true})`.

### 12. MAX_DEPTH=8 is too shallow for Webflow sites

**Platform:** Webflow
**Context:** Extracting styles from blazity.com case study cards.
**Problem:** Webflow wraps content in 6 levels of utility divs (padding-global → container-large → padding-section → component → wrapper → content). MAX_DEPTH=8 left only 2 levels for actual content. Card interiors (images, headings, descriptions) had empty `children` arrays.
**Rule:** Use MAX_DEPTH=20 for Webflow. The extra depth captures card interiors through the nesting. Strip the wrapper noise by filtering default styles rather than limiting depth.

### 13. Raw computed styles are 75% noise — filter at extraction time

**Platform:** Universal
**Context:** Agent implementing sections from 200KB spec files.
**Problem:** Each element had 64 style properties, 48 of which were defaults (0px, none, normal, auto). The agent had to sift through noise to find signal, and frequently picked wrong values because nearby elements had similar-looking properties.
**Rule:** Filter defaults at extraction time. Skip values matching: 0px, none, normal, auto, rgba(0,0,0,0), start, visible, static. Also skip inherited values that match the parent. Output should have ≤30 properties per element.

### 14. blazity.com uses 275ms transitions, not Tailwind's default 150ms

**Platform:** Webflow
**Context:** Comparing button hover speeds between blazity.com and local site.
**Problem:** All interactive elements felt snappier locally. blazity.com CSS has `transition: 0.275s` on all buttons/links. Tailwind's default `transition-colors` uses 150ms.
**Rule:** Use `duration-[275ms]` on all transition classes to match the reference site's timing. Check `transitionTimings` in the animation spec for the exact values.

### 15. Extraction captures per-element styles but misses global CSS foundation

**Platform:** Universal
**Context:** Homepage had correct per-element font sizes and colors but "felt off" across the entire site.
**Problem:** Body font-size was 16px (browser default) vs blazity.com's 14px. Body color was neutral-900 vs neutral-800. Container padding was fixed 72px vs percentage-based 5%. Heading/paragraph margins were not reset to 0. These global differences cascaded to every section.
**Rule:** Always extract and apply global foundation first (`00-globals.json`). Check body defaults, container system, margin resets, and section padding before implementing any sections. Per-element specs are useless on the wrong foundation.

### 16. LLMs are unreliable CSS-to-Tailwind translators — let the script do it

**Platform:** Universal
**Context:** 5 rounds of implementation with specs containing raw CSS values (fontSize: "14px", color: "rgb(62, 68, 76)").
**Problem:** The agent made small translation errors on every section: 16px instead of 14px, font-medium instead of font-semibold, text-neutral-900 instead of text-neutral-800. 750+ mapping decisions per section at ~95% accuracy = ~37 wrong values. Discipline fixes (rationalization tables, verify hints) didn't solve the inherent unreliability.
**Rule:** The extraction script now outputs a pre-computed `classes` field with Tailwind classes. The agent applies these verbatim — no translation step. The `tailwind-mapper.ts` module handles all CSS→Tailwind conversion deterministically.

### 17. Reconciliation doesn't work — generate JSX directly

**Platform:** Universal
**Context:** 6 rounds of asking agents to "read spec, compare against code, fix differences."
**Problem:** The agent consistently judged existing code as "close enough" and made minimal changes. In the final pass with pre-computed Tailwind classes, it changed only 2 lines across 12 sections. LLMs can't reliably spot subtle differences between similar class strings.
**Rule:** Don't ask agents to reconcile specs against existing code. Generate the JSX directly from specs using `scripts/generate-jsx.ts`. The agent's job is: take generated JSX, wrap in React component, add interactivity. Never modify generated classes.

### 18. JSX generation from Webflow DOM breaks React layouts

**Platform:** Webflow
**Context:** Generated JSX files from Webflow's DOM tree to eliminate LLM class translation errors.
**Problem:** Webflow DOM has 6 wrapper levels, hardcoded pixel widths (w-[405.328px]), absolute-positioned background divs, and Webflow-specific layout patterns (w-row, w-col) that don't work without Webflow's CSS. Generated JSX broke responsive layouts, broke image paths (used CDN hashes instead of local files), and introduced non-functional background divs.
**Rule:** Never generate JSX from Webflow's DOM structure. The React component structure must be written for React (responsive, semantic, no wrapper soup). Only the className VALUES should come from specs. Use the class patching approach: keep existing React structure, surgically replace only the className strings.

### 19. Class patching is the correct granularity for visual parity fixes

**Platform:** Universal
**Context:** 7 rounds of trying different approaches: screenshot-based, spec reconciliation, JSX generation.
**Problem:** Each approach either asked the LLM to do too much (translate CSS, reconcile code, generate structure) or replaced too much (entire JSX). The sweet spot is: keep the structure, replace only the class strings.
**Rule:** Use `generate-class-patches.ts` to produce explicit find/replace instructions. Agent executes them literally. For remaining structural gaps, use targeted Playwright inspection with strict guardrails (additive only, max 3 attempts, snapshot before starting).

### 20. Element matching needs multi-signal scoring, not text-only

**Platform:** Universal
**Context:** compare-rendered.ts matched only 7% of elements using text content and DOM position.
**Problem:** Text matching fails on encoding differences (apostrophes, entities). Position matching fails because Webflow has 6 wrapper levels vs React's 2. Result: 93% of elements unmatched, most sections had 0 actionable diffs.
**Rule:** Use multi-signal scoring: text similarity (exact/fuzzy/substring) + bounding box overlap + tag match + size match. Score >= 8 to accept. Greedy assignment prevents duplicate matches. This gets >50% match rate across different DOM structures.

### 21. Next.js wraps content in `<main>`, breaking section detection

**Platform:** Next.js
**Context:** compare-rendered.ts found only 3 body-level sections on the local site (header, main, footer) vs 12 on the Webflow reference.
**Problem:** Next.js layout.tsx wraps page content in `<main>`. The walker used `body > *` for section detection, so all page sections collapsed into one `<main>` section. Section index mismatch meant zero cross-site matches.
**Rule:** Detect `<main>` in the walker. If present, use `header` as section 0, `main > *` as sections 1..N, and `footer` as the last section. This aligns section indices across different site architectures.

### 22. Always kill dev servers when agent finishes

**Platform:** Universal
**Context:** 12 parallel agents each started a dev server on ports 3000-3011.
**Problem:** Agents committed and exited without killing their dev server processes. 12 orphaned Node processes remained running, consuming RAM and blocking ports for future runs.
**Rule:** Every agent that starts a dev server MUST kill it before exiting: `kill $(lsof -t -i:[PORT]) 2>/dev/null`. This applies whether the agent succeeds, fails, or hits max iterations.

### 23. Clean stale worktrees before dispatching parallel agents

**Platform:** Universal
**Context:** Orchestrator dispatched 12 visual MCP agents for /services page migration.
**Problem:** 30 stale worktrees from previous homepage runs were never cleaned up. When new agents tried to create worktrees, some failed due to branch name conflicts. Failed agents fell back to the main repo directory and worked on the wrong branch (main instead of their feature branch). 3 of 12 agents committed to the wrong branch.
**Rule:** Every orchestrator MUST run worktree cleanup as Step 0 before dispatching any agents: `git worktree list | grep ".claude/worktrees" | awk '{print $1}' | xargs -I{} git worktree remove --force {}` and `git branch | grep "worktree-agent-" | xargs -I{} git branch -D {}`.

### 24. SPA pages with session state extract identical fallback content

**Platform:** Svelte, Vue, React SPAs with client-side routing
**Context:** Migrating Ripley's Gatlinburg. 5 checkout pages required prior ticket selection state.
**Problem:** Direct URL navigation showed a fallback "Explore our Locations" view instead of checkout content. All 5 checkout pages extracted byte-identical specs (same MD5 hash). Build agents had no way to know the specs were wrong and hallucinated plausible checkout layouts from training data. The first page (tickets) was accurate because it's a public page with no state dependency.
**Rule:** Run `scripts/probe-page.ts` before extraction. If ANY page shows fallback content, STOP the migration and ask the user how to proceed. Never autonomously create flow definitions or switch extraction strategy. Always run `scripts/validate-extraction.ts` after extraction to catch duplicate specs. NEVER proceed to build if content sections are duplicated across pages.

### 25. Platform-specific fixes must not contaminate shared extraction scripts

**Platform:** Universal
**Context:** During Ripley's migration, the orchestrator modified 4 shared extraction scripts and created `scripts/lib/section-discovery.ts` to handle Svelte SPA container detection.
**Problem:** Svelte-specific SPA detection logic was baked into every extraction run for every platform. Future Webflow/WordPress migrations would run unnecessary SPA container detection. The agent solved the wrong problem — the real issue was session state, not section discovery.
**Rule:** NEVER modify files in `scripts/` or `scripts/lib/` for platform-specific behavior. Create adapter files at `adapters/<platform>.json` instead. Adapters encode platform knowledge (selectors, cookie banners, CDN patterns, SPA hints) in JSON config that scripts load via `--adapter` flag. The orchestrator skill explicitly prohibits script modifications.

### 26. Agent assumed page was unreachable without probing — built fully hallucinated page

**Platform:** Universal
**Context:** Migrating Ripley's Gatlinburg v2. The confirmation page URL was directly navigable.
**Problem:** The agent assumed `/checkout/confirmation` required a completed purchase based on e-commerce domain knowledge. It never ran the probe script on that URL. During flow-based extraction, it clicked "Complete Purchase" which failed (no payment info), and the SPA redirected back to the configuration page. The extraction captured configuration content and labeled it "confirmation." The build agent received wrong specs and built an entirely hallucinated confirmation page with 24 invented attractions that exist nowhere on the reference site.
**Rule:** ALWAYS probe every URL the user provides. Never assume page behavior from URL patterns or domain knowledge. The probe result is the only valid input to extraction strategy decisions. If probe shows the page is directly accessible, use direct extraction — even if the URL looks like it "should" require prior state.
**Recovery:** Re-probe the confirmation URL directly. It returns `DIRECT_EXTRACTION`. Extract normally.

### 27. Always check migrated-sites/ before naming a new migration

**Platform:** Universal
**Context:** Proposing output directory for Ripley's v3 migration.
**Problem:** The agent proposed `migrated-sites/ripleys/` without checking that `migrated-sites/ripleys/` already existed from v1/v2 runs. This would overwrite or conflict with previous migration output.
**Rule:** Before proposing a migrated site directory name, always `ls migrated-sites/` to see what exists. Use a versioned name (e.g., `ripleys-v3`) if previous versions exist. Never reuse or overwrite an existing migration directory.

### 28. Always use the latest stable versions of all technologies

**Platform:** Universal
**Context:** Project was running Node.js v21.1.0 (non-LTS, outdated). This caused the `__name` reference error — tsx/esbuild injects `__name` helpers that break in Playwright's `page.evaluate()` browser context. Node 22.6+ has native TypeScript strip-types support that eliminates esbuild transformations entirely.
**Problem:** Using outdated or non-LTS versions of Node.js, frameworks, and tools leads to working around bugs that are already fixed upstream. Node 21 is not LTS and lacks native TS support. The `__name` bug wasted hours across v1 and v2 migrations.
**Rule:** Before starting any project or proposing any technology version, check online for the latest stable/LTS version. Always use it. Never propose deprecated or non-LTS versions. This applies to Node.js, package managers, frameworks, and all dependencies.

### 29. Always run preflight before merging or starting migrations

**Platform:** Universal
**Context:** The `__name` reference error in `page.evaluate()` only surfaced during lengthy migration runs, wasting hours.
**Problem:** Runtime errors in extraction scripts are invisible until a migration is underway. Compile checks (`tsc --noEmit`) don't catch runtime issues like browser evaluate context errors, missing Playwright browsers, or broken imports.
**Rule:** Run `pnpm preflight` after any changes to the extraction pipeline. NEVER merge to main on remote if preflight is failing. The orchestration skill runs preflight as Phase 0 — if it fails, the migration does not start. This is a hard gate with no exceptions.

### 30. Migration output artifacts are gitignored — only learnings are committed

**Platform:** Universal
**Context:** Ripley's v2 committed 151 images and 57 spec files to git. These were regenerated per-run and bloated the repo.
**Problem:** Extracted specs (`docs/specs/`), images (`public/images/`), and reference screenshots are generated fresh each migration run. They're not reused across migrations and don't improve future runs. Committing them bloats git history with large binaries and stale data.
**Rule:** Only commit artifacts that improve future migrations: reports (`docs/migrations/`), adapters (`adapters/`), and lessons. Everything else — specs, images, screenshots, migrated sites — is gitignored and regenerated per-run.

### 31. Always scaffold a proper Next.js project before extraction

**Platform:** Universal
**Context:** Ripley's v3 migration attempt. The tailwind mapper crashed with `ENOENT` because no `globals.css` or `layout.tsx` existed at the repo root.
**Problem:** The agent created placeholder files at the repo root (`src/app/globals.css`) as a hack to stop the crash. The repo root should never have a `src/` directory — that belongs in the migrated site. The mapper should read from the migrated site's scaffolded project.
**Rule:** Always scaffold a Next.js project at `migrated-sites/[SITE_NAME]/` using `pnpm create next-app@latest` BEFORE running extraction. The mapper reads from the scaffolded project's `src/app/` directory. If the project doesn't exist yet, the mapper gracefully returns empty token maps.

### 32. Never hallucinate page content — if no specs, skip the page

**Platform:** Universal
**Context:** Ripley's v2, v3, and v4 migrations. The confirmation page could not be directly extracted (SPA fallback). The agent built "Order Confirmed! Thank you for your purchase!" with 24 invented attractions — none from the reference site.
**Problem:** When extraction fails for a page, the agent builds it from training data instead of skipping it. The result is completely hallucinated content that has no relation to the reference site.
**Rule:** NEVER build a page without extracted specs. If extraction fails or produces fallback content, log the page as unextractable in the report and skip it. Do not hallucinate content.

### 33. Never autonomously create flow definitions or switch extraction strategy

**Platform:** Universal
**Context:** Ripley's v4 migration. The agent was given 6 URLs and told to extract them. The probe flagged all pages as SPA fallback. The agent autonomously created a flow definition at `.ai/flows/ripleys-checkout.json` and used flow-based extraction — ignoring the user's URLs.
**Problem:** The instructions (CLAUDE.md, SKILL.md, lesson 24) explicitly told the agent to create flows when SPA fallback was detected. The agent followed those instructions. But this led to skipping the confirmation page and hallucinating its content across three migration attempts.
**Rule:** If any page shows SPA fallback, STOP the migration and ask the user. Never autonomously create flow definitions, switch to flow-based extraction, or decide that a page is unreachable. The user decides how to handle SPA pages.

### 34. Commit working files before dispatching worktree agents

**Platform:** Universal
**Context:** Ripley's v4 migration. Subagents dispatched with worktree isolation couldn't see extracted specs, visual diffs, images, or the migrated site — all gitignored.
**Problem:** Git worktrees only contain tracked files. `docs/specs/`, `docs/visual-diffs/`, `public/images/`, and `migrated-sites/` are in `.gitignore`. Subagents got empty directories and failed or the orchestrator had to hack the gitignore during the run.
**Rule:** Before EVERY agent dispatch, run a surgical `git add -f` that tracks only source code and configs — never `.next/`, `node_modules/`, or build artifacts. See the orchestration skill for the exact command. The `-f` flag overrides gitignore on the feature branch. The gitignore still protects main from accidental pollution. **NEVER use `git add -f migrated-sites/[SITE_NAME]/` (blanket add) — it force-tracks Turbopack cache and node_modules, causing 140GB+ memory explosions in worktrees.**

### 35. SPA visual verification needs flow-aware script

**Platform:** Svelte, Vue, React SPAs
**Context:** Ripley's v5 migration. verify-visual.ts returned 0 reference sections for all SPA pages because it navigates directly to URLs that show fallback content.
**Problem:** The standard verify-visual.ts opens a fresh browser and navigates to the reference URL. For SPA pages requiring session state, this shows fallback instead of real content. The extraction solved this with extract-spa-flow.ts, but verification had no equivalent.
**Rule:** For SPA migrations that used a flow for extraction, use `verify-visual-golden-spa.ts` for visual verification. Golden screenshots are captured during extraction and used as the reference — no SPA navigation needed during Phase 3. Flow files use `.spa.json` extension. Static sites continue using `verify-visual.ts` unchanged.

### 36. SPA visual verification uses golden screenshots from extraction, not live reference navigation

**Platform:** Svelte, Vue, React SPAs
**Context:** Ripley's v5 and v6 migrations. verify-visual-flow-spa.ts tried to navigate the SPA flow during verification but failed — selectors break at mobile viewports, section counts change between viewports, and agents looped for hours with no progress.
**Problem:** Navigating the SPA flow during verification is fundamentally unreliable: (1) flow selectors designed for 1440px don't work at 375px, (2) SPA DOM changes between viewports (footer collapses, elements reflow), (3) section indices don't align between SPA reference and Next.js local site.
**Rule:** For SPA migrations, golden screenshots are captured DURING extraction (same page state, same viewport, same DOM as the specs). Visual verification compares the local site against these golden files. No reference site navigation during Phase 3. Use verify-visual-golden-spa.ts, not verify-visual-flow-spa.ts.

### 37. Archive completed plans and specs — stale docs confuse agents

**Platform:** Universal
**Context:** Independent audit found completed plans sitting in active directory with sequential "delete X, create Y" instructions that auditors read as contradictions.
**Problem:** Old plans reference scripts that no longer exist and approaches that were superseded. Agents or humans reading them follow outdated instructions.
**Rule:** After implementing a plan, move it to `.ai/plans/archive/`. After superseding a spec, move it to `docs/specs/archive/`. Active directories should only contain current, actionable documents.

### 38. Keep AGENTS.md session startup synchronized with current state

**Platform:** Universal
**Context:** AGENTS.md said "23+ pitfalls" when lessons.md had 36 entries.
**Problem:** Stale numbers and descriptions in top-level docs degrade trust. Contributors follow old assumptions.
**Rule:** After adding lessons, adapters, or changing the pipeline, update AGENTS.md counts and descriptions to match. This includes lesson count, adapter count, and key lessons summary.

### 39. Always verify all dependencies are on latest stable before each migration

**Platform:** Universal
**Context:** Independent audit couldn't run `pnpm audit` due to registry 403, and TypeScript was behind (5.9 → 6.0).
**Problem:** Outdated dependencies accumulate silently. Deprecated packages introduce security risks and compatibility issues.
**Rule:** Before starting any new project or migration round, run `pnpm outdated` and update all dependencies to latest stable. No deprecated or EOL packages allowed. This is enforced by CI dependency checks when registry access is configured.

### 40. SPA visual verification must use full-page comparison, not per-section

**Platform:** Svelte, Vue, React SPAs
**Context:** Ripley's v7 migration. Per-section golden screenshots had different section counts (4 at 1440px, 2 at 375px), included iframes (reCAPTCHA), and had completely different DOM ordering than the local Next.js site. Index-based comparison mapped golden[0]=wrapper to local[0]=nav — all diffs were 85-95%, completely meaningless.
**Problem:** SPA DOM structure differs fundamentally from the migrated Next.js site. Section discovery produces different elements in different orders. Per-section alignment is structurally impossible between SPA reference and Next.js local.
**Rule:** For SPA migrations, use full-page screenshots for golden capture and verification. Compare entire pages pixel-by-pixel. The diff highlights WHERE things differ without needing section alignment. Static site migrations continue using per-section comparison (both sides have the same DOM structure).

### 41. SPA visual parity agents must use golden template, not live reference navigation

**Platform:** Svelte, Vue, React SPAs
**Context:** Ripley's v4-v8 migrations. Visual parity agents used the static `visual-mcp-agent.md` template which navigates to `[REFERENCE_URL]`. For SPA checkout pages, this showed fallback content. Agents compared against the wrong page for 5 consecutive runs.
**Problem:** The static template's step 2 says "Navigate to [REFERENCE_URL]." For SPAs, this shows fallback, not the real page. Agents read CSS values from the fallback and tried to apply them to checkout components — achieving nothing across ~770 tool uses (7 agents × 110 iterations).
**Rule:** For SPA migrations, use `visual-golden-spa-agent.md` template. Agents read CSS values from extracted `.styles.json` specs and compare visually against golden screenshots. They NEVER navigate to the reference URL. The `orchestrate-page-fix` skill selects the correct template based on whether extraction used a flow.

### 42. Image filename derivation must use URL hash, not alt text

**Platform:** Universal (especially Directus, Contentful, Sanity)
**Context:** Ripley's v2-v9 migrations. All ticket card images showed the same placeholder because they shared alt text.
**Problem:** `deriveFilename()` used alt text as filename first. Multiple images with the same alt (e.g., "Attraction") → same filename → first download wins → one image for all cards.
**Rule:** Use a hash of the image URL as the filename (with alt text as human-readable prefix). This guarantees uniqueness regardless of shared alt text. Format: `{alt-prefix}-{url-hash}.{ext}`.

### 43. Extraction must capture ::before and ::after pseudo-element styles

**Platform:** Universal
**Context:** Ripley's card overlays use `::before` with `linear-gradient(to top, rgb(232, 38, 110)...)`. Each card has a different gradient color.
**Problem:** `extractElement()` only captures `getComputedStyle(el)` — never `getComputedStyle(el, '::before')`. Pseudo-element gradients, decorative overlays, and badges are invisible to extraction. Build agents never know they exist.
**Rule:** For each element, check if `::before` or `::after` has `content !== "none"`. If so, capture key visual properties (backgroundImage, backgroundColor, width, height, position, opacity, borderRadius) and include in the style entry.

### 44. SPA sites use display:none toggling for responsive layouts — capture both variants

**Platform:** Svelte, Vue SPAs
**Context:** Ripley's uses `section.content-tablet-up` (desktop cards) and `section.content-tablet-down` (mobile cards) as separate DOM elements hidden/shown via CSS.
**Problem:** Extraction at 1440px captures only desktop cards. Extraction at 375px captures only mobile cards. The build agent gets two separate spec files but doesn't know they're responsive pairs of the same content.
**Rule:** Output per-viewport structure files (`structure-375x812.md`, `structure-1440x900.md`) alongside the main structure. The build agent can see both layouts and create a responsive component.

### 45. Parallel agents must isolate .next/ cache directories

**Platform:** Next.js
**Context:** Ripley's v9 — 9 visual parity agents fought over shared `.next/` directory, causing 10-20 wasted iterations per agent on dev server restarts.
**Problem:** Next.js locks `.next/` during compilation. Multiple agents running `pnpm dev` in the same project directory collide on the lock.
**Rule:** Agents MUST run in isolated worktrees (`isolation: "worktree"` in Agent tool). Each worktree has its own `.next/` directory, preventing lock conflicts. Never dispatch visual parity agents without worktree isolation.

### 46. Cookie banners break section discovery unwrap logic

**Platform:** Universal
**Context:** Callstack.com migration. Extraction produced 4 sections instead of 11.
**Problem:** CybotCookiebotDialogActive was counted as a body-level section, increasing the count from 3 to 4. The `tryUnwrapMegaSection()` function only unwraps when there is exactly 1 middle section between first/last. With the cookie banner, there were 2 middle sections, so unwrap didn't trigger. The entire page stayed as one `03-page-wrapper` spec.
**Rule:** Cookie banner elements must be unconditionally excluded from section discovery. Use `adapters/cookie-consent.json` — all known CMP containers are always skipped regardless of detection.

### 47. Cookie consent is orthogonal to frameworks — never put cookie handling in framework adapters

**Platform:** Universal
**Context:** Callstack migration created a full duplicate `callstack-webflow.json` adapter just for a different cookie banner selector.
**Problem:** Any website can use any cookie consent solution. Baking `cookieBanner` into framework adapters creates N frameworks x M cookie solutions = combinatorial explosion.
**Rule:** Cookie consent handling lives in `adapters/cookie-consent.json` and `scripts/lib/cookie-consent.ts`. Framework adapters do NOT have `cookieBanner` fields.

### 48. Agents without superpowers skills deviate from prescribed architecture

**Platform:** Universal
**Context:** Callstack migration ran without `superpowers:executing-plans` and `superpowers:dispatching-parallel-agents`.
**Problem:** Without enforcement skills, the agent treated the orchestration skill as suggestions. It chose an HTML dump approach instead of per-section components, did serial local fixes instead of parallel agent dispatch.
**Rule:** The orchestration skill requires both superpowers skills. Phase 0 aborts if either is unavailable. No degraded execution.

### 49. Dynamic elements waste visual parity iteration budget

**Platform:** Universal
**Context:** Callstack.com has cycling logos (GSAP repeat:-1), hero webm, typing effects, GIFs.
**Problem:** Pixel comparison of non-deterministic elements always shows a diff. The agent spent iterations trying to freeze carousels (reorderSlides, slideTo(0)) which violates live-behavior requirements.
**Rule:** Auto-detect dynamic elements during extraction (infinite animations, autoplay media, GSAP infinite timelines). Output `dynamic-masks.json`. verify-visual.ts masks these regions before comparison. The masked diff is the pass/fail criterion.

### 50. Codex CLI sandbox blocks Playwright and localhost on macOS

**Platform:** Codex CLI on macOS
**Context:** Callstack migration. Sandboxed Playwright failed to launch (Seatbelt blocks Chromium Mach port rendezvous). Localhost binding returned EPERM.
**Problem:** Codex's macOS sandbox (Seatbelt) is fundamentally incompatible with Playwright browser automation and dev server connections.
**Rule:** Codex migrations must use `--sandbox danger-full-access`. This is a project configuration requirement, not a runtime check.

### 51. Memory leaks from Playwright + third-party scripts can spike to 200GB

**Platform:** Universal
**Context:** Callstack Phase 4 (animations). Single agent, single server on port 3003.
**Problem:** Playwright browser contexts accumulating without cleanup, each running infinite GSAP timelines, Swiper, jQuery, and Webflow JS. Memory gradually spiked to ~200GB (macOS swap thrashing) before recovering to 500MB after processes completed.
**Rule:** Between every section evaluation, close the browser context and open a fresh one. The orchestrator runs a memory watchdog (32GB threshold on 48GB machine) that kills browser processes if exceeded. Agent templates include explicit resource management rules.

### 52. Framer sites need a dedicated adapter — generic section discovery fails

**Platform:** Framer
**Context:** doodle.com migration. Body > * found 3 mega-containers instead of 10+ visual sections.
**Problem:** Framer wraps all content in 2-3 top-level containers with hashed class names. Without a Framer adapter, section discovery can't drill to the right DOM level. The `framer-` prefix is constant but hashes change on recompile.
**Rule:** Always use `adapters/framer.json` for Framer sites. The adapter sets `minExpectedSections: 5` and `disableUnwrap: true` to trigger deeper container detection and prevent splitting visually coupled layers.

### 53. Section auto-unwrap must not split absolutely positioned sibling layers

**Platform:** Universal
**Context:** doodle.com unwrap split `framer-1juqp9f` into an absolute background image and content overlay — visually inseparable elements.
**Problem:** `tryUnwrapMegaSection` blindly unwraps children without checking visual coupling. When child A is `position: absolute` covering child B, they're a composed visual unit, not independent sections.
**Rule:** Post-unwrap coupling check: if any child is `position: absolute` and overlaps >80% of a sibling's area, abort the unwrap. Additionally, adapters can set `disableUnwrap: true` for platforms known to use this pattern.

### 54. Responsive prefix injection must not split content inside Tailwind arbitrary values

**Platform:** Universal
**Context:** doodle.com extraction produced `lg:bg-[rgba(7, lg:7, lg:7, lg:0.3)]` from `bg-[rgba(7, 7, 7, 0.3)]`.
**Problem:** `mapMultiViewportStyles` splits class strings on spaces before adding prefixes. Arbitrary values with spaces (rgba, calc, etc.) get fragmented.
**Rule:** Use bracket-aware splitting. Normalize spaces inside `[...]` before splitting. Never inject responsive prefixes into content inside square brackets.

### 55. Strip computed pixel dimensions from structural elements — they are layout noise

**Platform:** Universal
**Context:** doodle.com extraction produced `md:w-[768px] md:h-[2343.97px]` on section containers.
**Problem:** `getComputedStyle()` returns the browser's final pixel calculation, not design intent. A 100%-width container reports `1440px` at a 1440px viewport. Applying that value creates a rigid layout that overflows at other viewports.
**Rule:** Strip `w-[Npx]` and `h-[Npx]` on all structural/text elements. Preserve only on media elements (img, svg, video, canvas, iframe). Always preserve max-width, min-width, max-height, min-height. Let flex/grid handle structural sizing.

### 56. Every migration requires a verified adapter — no exceptions

**Platform:** Universal
**Context:** doodle.com migration attempted without a Framer adapter. Pipeline had zero platform knowledge.
**Problem:** Without an adapter, section discovery produces mega-containers, class patterns aren't understood, and CDN assets aren't recognized. The build agent cannot achieve meaningful parity.
**Rule:** The orchestration skill's Phase 0 setup probe must detect the framework AND find a matching adapter. If the framework is detected but no adapter exists, STOP. If no framework is detected, try static-html.json fallback. Never proceed without platform knowledge.

### 57. Adapters are sacred — build from documentation, not assumptions

**Platform:** Universal
**Context:** Adapter ecosystem audit found 4 stub adapters with URL-pattern-only detection and no verified fields.
**Problem:** Stub adapters give false confidence. A migration that "detects" Contentful via URL pattern but has no section discovery or image format knowledge will still fail.
**Rule:** Every adapter must pass the 5-step research protocol: official docs research, live site DOM inspection, detection verification on 2+ sites, section discovery verification, and 3+ documented quirks. Research sources are saved in `.ai/research/YYYY-MM-DD-[platform]-adapter-research.md`.

### 58. Multi-layer probe detection catches 90%+ of frameworks

**Platform:** Universal
**Context:** Single-layer detection (DOM markers only) missed Framer on doodle.com because no adapter existed to provide markers.
**Problem:** Layer 2 detection requires an adapter to already have markers defined. New platforms are invisible.
**Rule:** The probe uses 3 detection layers: Layer 1 (pre-render: HTTP headers, meta generator, script domains), Layer 2 (post-render: DOM markers, JS globals), Layer 3 (deep scan: class pattern analysis, CDN fingerprinting). Stops early on definitive signals. Even unknown platforms get detected via class prefix patterns in Layer 3.

### 59. verify-visual.ts cache must include reference URL

**Platform:** Universal
**Context:** doodle-v2 migration reused cached screenshots from blazity.com (16 sections), producing meaningless 91-98% failures.
**Problem:** Cache key was filename-only. Screenshots from any previous migration in the same viewport directory were silently reused.
**Rule:** Cache meta (`.cache-meta.json`) stores the reference URL. On cache hit, validate URL matches. Mismatch → invalidate and recapture.

### 60. localSite.sectionSelector is for the local site only

**Platform:** Universal
**Context:** doodle-v2 verification applied `localSite.sectionSelector` to the reference Framer site, breaking section discovery.
**Problem:** `screenshotSections()` used the local selector for both reference and local pages, applying Next.js section rules to the Framer reference.
**Rule:** Only apply `localSite.sectionSelector` when screenshotting the local (migrated) site. Reference sites use `sectionDiscovery` config via `discoverSections()`.

### 61. renderStructureTree must show text on parent elements

**Platform:** Universal
**Context:** doodle-v2 structure.md dropped "Full calendars were never the answer. This is." because the heading was inside a container with children.
**Problem:** `renderStructureTree()` only displayed text for leaf nodes (`el.children.length === 0`). Framer wraps headings in nested containers.
**Rule:** Show text on all elements that have it, regardless of child count. Slightly noisier output is acceptable — silently dropping headings is not.

### 62. Copy extracted images into migrated app public/ before build

**Platform:** Universal
**Context:** doodle-v2 build showed 83% diff because images were at repo-root `public/images/` but Next.js only serves the app-local `public/`.
**Problem:** `extract-images.ts` writes to repo root. No orchestration step bridged the gap to `migrated-sites/[SITE]/public/`.
**Rule:** After extraction, orchestration must `cp -r public/images/ migrated-sites/[SITE_NAME]/public/images/` before dispatching the build agent.

### 63. Phase 2 is done when pnpm build passes

**Platform:** Universal
**Context:** doodle-v2 orchestrator stayed in Phase 2 after `pnpm build` passed, manually iterating on parity issues that belonged in Phase 3.
**Problem:** No hard gate defined Phase 2 completion. The orchestrator rationalized staying in Build to fix section boundaries and verifier instability.
**Rule:** Phase 2 completion = `pnpm build` passes + build agent committed. Promote to Phase 3 immediately. Parity issues after build are Phase 3 work.

### 64. PAGE_NAME must match extraction output directory exactly

**Platform:** Universal
**Context:** doodle-v3 build agents exited with 0 iterations because extraction saved to `docs/specs/homepage/` but build agent was dispatched with `[PAGE_NAME]=doodle-homepage`.
**Problem:** No verification that `docs/specs/[PAGE_NAME]/manifest.json` exists before dispatching the build agent. The orchestrator used different naming conventions between extraction and dispatch.
**Rule:** Before dispatching build agents, verify `docs/specs/[PAGE_NAME]/manifest.json` exists. If it doesn't, check what `docs/specs/` directories actually exist and use the correct name.

### 65. Shared adapter selectors must be generic across all sites

**Platform:** Universal
**Context:** doodle-v3 orchestrator wrote `div[data-framer-name^='Homepage']` into `framer.json`, breaking it for all non-Doodle Framer sites and reverting post-mortem Fix 4.
**Problem:** Earlier extraction instructions said "adjust the adapter's primarySelector" without specifying that adjustments must remain generic. The orchestrator complied literally by putting a site-specific selector in the shared adapter.
**Rule:** Shared adapters work for ALL sites on a framework. If a specific site needs a different selector, create a site-specific override adapter (e.g., `doodle-override.json`) passed as an additional `--adapter` flag.

### 66. validate-extraction.ts must accept single-page migrations

**Platform:** Universal
**Context:** doodle-v3 single-page migration could not run extraction validation because `validate-extraction.ts` requires 2+ spec dirs.
**Problem:** Script was designed for multi-page migrations only. Single-page runs get a usage error, so the safety check is silently skipped.
**Rule:** Accept 1 spec dir — skip duplicate check (nothing to compare), validate structure files exist, exit PASS.

### 67. Framer section discovery requires recursive mega-section expansion

**Platform:** Framer
**Context:** `spaContainerHints: ["[data-framer-name]"]` matched 157-545 elements per Framer site. `detectSpaContainer()` alone gave 2-3 coarse sections on deeply nested sites because mega-sections bundle multiple visual sections.
**Problem:** Framer uses `data-framer-name` on every named layer (not just sections), and wraps sections at non-uniform depths with transparent full-height wrapper divs.
**Rule:** After `detectSpaContainer()`, recursively expand: skip wrappers (within ±5% of parent height), split mega-sections (>25% of parent height with ≥2 visible children), up to 3 levels deep. Tested on 6 Framer sites: 5/6 correct. Add a ceiling check on spaContainerHints (>3× minExpectedSections = reject).

### 68. Adapters must be validated against 10 live sites before merging

**Platform:** Universal
**Context:** framer.json shipped with `spaContainerHints: ["[data-framer-name]"]` that was tested against 0 real Framer sites. It produced 157 sections on every Framer site, causing 4 failed doodle.com migration attempts across v2-v4.
**Problem:** Single-site validation (or no validation) doesn't catch over-segmentation, broken selectors, or false detection. The failure only appeared when the adapter was used in a real migration.
**Rule:** Every adapter requires `pnpm ts scripts/validate-adapter.ts` against 10 live sites. Framework: ≥8/10 produce 3-30 sections. CMS: 10/10 detected. No exceptions.

### 69. Canonical workflow phases are 0, 1, 2, 3

**Platform:** Universal
**Context:** Workflow docs accumulated fractional labels, which made prompts and reports inconsistent.
**Problem:** Mixed naming causes the same migration to be described with multiple phase schemes, which makes reports harder to read and easier to contradict.
**Rule:** Use only Phase 0: Setup, Phase 1: Extraction, Phase 2: Build, and Phase 3: Refine, plus the Phase 3A/3B/3C sublabels. Do not use fractional phase labels in prompts, reports, or decisions.

### 70. Phase 2 must return EXTRACTION_INCOMPLETE instead of inventing structure

**Platform:** Universal
**Context:** Build baseline verification can fail when extraction output is incomplete or missing.
**Problem:** If Phase 2 guesses section structure or fabricates components, the migration drifts away from the extracted specs and the later phases optimize the wrong page.
**Rule:** If Phase 2 baseline verification reveals incomplete extraction output, stop and return `EXTRACTION_INCOMPLETE`. Do not invent structure, split sections, or proceed into Phase 3 with fabricated components.

### 71. Worktree agents may branch from main — always merge feature branch first

**Platform:** Universal
**Context:** doodle-v9 build agent worktree branched from main instead of feat/doodle-v9-migration. Specs force-committed to the feature branch were invisible.
**Problem:** Claude Code `isolation: "worktree"` may create worktrees from the default branch, not the orchestrator's current branch. Gitignored files force-committed to the feature branch are missing.
**Rule:** The build template includes a merge step: `git merge [FEATURE_BRANCH] --no-edit`. Orchestrator fills `[FEATURE_BRANCH]` from `git branch --show-current` before dispatch.

### 72. Build baseline signature comparison causes false positives on cross-framework migrations

**Platform:** Universal
**Context:** doodle-v9 Gatsby-to-Next.js migration. verify-build-baseline returned EXTRACTION_INCOMPLETE despite 9/9/9 section counts with no missing roles.
**Problem:** `summarizeBuildBaseline()` required exact per-element signature match (heading + shape + cues). Cross-framework migrations produce different DOM fingerprints for identical content.
**Rule:** Signature mismatches are diagnostics, not gatekeepers. The baseline pass condition checks role counts and reference section count only. Visual verification catches structural issues signatures would have caught.

### 73. local-site-adapter.ts must not nullify sectionSelector

**Platform:** Universal
**Context:** doodle-v9 verify-visual found 3 local sections instead of 9. The nextjs adapter's sectionSelector was explicitly overridden to undefined.
**Problem:** With sectionSelector undefined, verify-visual falls back to body > * which finds only header, main, footer as 3 elements. Since 3 meets the minimum threshold, no deeper discovery triggers.
**Rule:** localSite.sectionSelector must pass through from the nextjs adapter. primarySelector remains undefined to preserve adaptive discovery as a fallback.

### 74. Build template must enforce semantic HTML tags for section discovery

**Platform:** Universal
**Context:** doodle-v9 build agent produced all sections with div root tags. The nextjs adapter's sectionSelector expects body > header, main > *, body > footer.
**Problem:** Without semantic tags, the selector cannot discover sections on the local site even when sectionSelector is correctly configured.
**Rule:** Build template Step 2 requires header/footer components to use semantic root tags. Step 4 requires content sections wrapped in main. Pages without header or footer omit them — the selector handles missing parts.

### 75. Soft "close tab" instructions don't prevent memory leaks — use hard pkill gates

**Platform:** Universal
**Context:** doodle-v9 build agent leaked 200GB RAM, crashing the machine. The template said "close tab via MCP between sections" but the agent accumulated browser instances across 9 sections.
**Problem:** Agents under verification pressure skip soft resource management rules. "Close the tab" is aspirational — MCP tab management is unreliable and agents don't verify closure.
**Rule:** The build template now requires `pkill -f chromium && pkill -f playwright` between EVERY section, plus a memory check that triggers force-kill above 8GB. Never rely on MCP tab management for resource cleanup.

### 76. Never blanket `git add -f` a migrated site directory

**Platform:** Universal
**Context:** doodle-v9 build agent. Orchestrator ran `git add -f migrated-sites/doodle-v9/` to sync working files for worktree subagents. This force-tracked 10,472 node_modules files (360MB) and 438 .next/ Turbopack cache files (114MB) through .gitignore.
**Problem:** When the worktree agent started `pnpm dev --turbopack`, Turbopack found stale cache from a different filesystem path. Turbopack is Rust-native (no GC) and entered pathological cache reconciliation, allocating 140GB in 5 seconds and killing the machine. This happened twice despite pkill gates — pkill targets chromium/playwright, not Turbopack.
**Rule:** The worktree sync command must be surgical: `git add -f migrated-sites/[SITE_NAME]/src/ migrated-sites/[SITE_NAME]/public/ migrated-sites/[SITE_NAME]/package.json ...` (explicit paths). NEVER `git add -f migrated-sites/[SITE_NAME]/` (blanket). Build artifacts (.next/), dependencies (node_modules/), and cache files must never enter git.

### 77. Build agents must use Playwright MCP tools, never Bash browsers

**Platform:** Universal
**Context:** doodle-v9 build agent. Template said "navigate via Playwright MCP" but did not name specific tools. Agent fell back to Bash-based Playwright commands (`npx playwright`, inline scripts) which spawn unmanaged browser processes.
**Problem:** Bash-launched browsers are invisible to MCP lifecycle management. They accumulate across sections and leak memory. Combined with the Turbopack cache explosion (lesson 76), this made the 140GB crash unrecoverable.
**Rule:** Build template now lists exact MCP tool names (mcp__playwright__browser_navigate, browser_take_screenshot, browser_close, etc.) and explicitly bans Bash-based browser launching. The only Bash-based browser use is verify-visual.ts which manages its own cleanup. Both the orchestration skill (Phase 0) and the build template now have hard gates that abort if Playwright MCP tools are unavailable.

### 78. Cookie dismissal must retry for dynamically injected CMPs

**Platform:** Universal
**Context:** doodle-v9 verify-visual.ts reported 21-44% false diffs on sections 1-3. The cookie consent banner from OneTrust was visible in screenshots, shifting section boundaries.
**Problem:** verify-visual.ts calls `dismissCookieBanner()` right after `domcontentloaded`, but doodle.com injects OneTrust dynamically via `script.src = 'https://cdn.cookielaw.org/...'`. At domcontentloaded time, the script hasn't executed — no `<script src>` element, no `#onetrust-consent-sdk` DOM, no `OneTrust` global. Detection returns null. Banner appears moments later.
**Rule:** `dismissCookieBanner()` now retries detection up to 6 times (3 seconds total) before falling through to the generic fallback. This handles all dynamically injected CMPs without penalizing fast-loading sites.

### 79. Always pass build template verbatim — never summarize agent prompts

**Platform:** Universal
**Context:** doodle-v9 Phase 2. Orchestrator paraphrased the 330-line build template into ~150 lines when dispatching the build agent, dropping large-desktop sweep requirements, shell fidelity rules, expanded trigger preservation, footer structure rules, and exit checklist details.
**Problem:** Summarized prompts lose battle-tested rules. The agent produces lower-quality output because it doesn't know about requirements that were omitted. Every line in the template exists because a previous migration failed without it.
**Rule:** Read the template file with the Read tool, substitute only the `[VARIABLES]`, and pass the full content as the agent prompt. Never rewrite from memory. Never "simplify for clarity." If the prompt is too long, the template needs trimming — not the dispatch.

### 80. Phase 2 is a build phase, not a polish phase

**Platform:** Universal
**Context:** doodle-v10 polls page (16 sections). Phase 2 took 29-50+ minutes. 72% of time was verification and fix loops. Agent spent 11 minutes fixing 3 sections from 5.78-7.25% (font rendering noise) — gave up and accepted them anyway.
**Problem:** The template conflated build and polish. Per-section verification after every component write was O(N) in tool calls. The 5% threshold caused unbounded fix loops for marginal failures that Phase 3A was designed to handle.
**Rule:** Phase 2 builds all sections first, then verifies once. Threshold is 10% (structural correctness). Max 3 verify-visual.ts runs. Visual polish (spacing, fonts, exact colors) is Phase 3A's job. Phase 2 should complete in 10-15 minutes regardless of section count.
