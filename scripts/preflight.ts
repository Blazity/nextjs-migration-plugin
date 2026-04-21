/**
 * Pre-flight smoke test — exercises every extraction script before a migration starts.
 * Catches runtime crashes, browser launch failures, evaluate context errors, and missing deps.
 *
 * Usage: pnpm preflight [--url <test-url>]
 * Default test URL: https://example.com
 */

import { chromium, type Page } from "@playwright/test"
import { discoverSections } from "./lib/section-discovery.ts"
import { loadAdapters } from "./lib/adapter-loader.ts"
import {
  summarizeBuildBaseline,
  summarizeExtractionCoverage,
  type GuardrailSection,
} from "./lib/phase-guardrails.ts"
import { existsSync } from "fs"

const urlIdx = process.argv.indexOf("--url")
const TEST_URL = urlIdx >= 0 ? process.argv[urlIdx + 1] : "https://example.com"

interface CheckResult {
  name: string
  passed: boolean
  error?: string
  duration: number
}

async function runCheck(name: string, fn: () => Promise<void>): Promise<CheckResult> {
  const start = Date.now()
  try {
    await fn()
    return { name, passed: true, duration: Date.now() - start }
  } catch (err: any) {
    return { name, passed: false, error: err.message?.slice(0, 200), duration: Date.now() - start }
  }
}

async function main() {
  console.log(`Preflight smoke test — ${TEST_URL}\n`)

  const results: CheckResult[] = []

  // Check 1: Browser launches
  results.push(await runCheck("browser-launch", async () => {
    const browser = await chromium.launch()
    await browser.close()
  }))

  // Check 2: Page navigation + evaluate with named functions
  let page: Page | null = null
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })

  results.push(await runCheck("navigate-and-evaluate", async () => {
    page = await context.newPage()
    await page.goto(TEST_URL, { waitUntil: "domcontentloaded", timeout: 15000 })
    // This is the exact pattern that broke with __name injection
    const result = await page.evaluate(() => {
      function walk(el: Element, depth: number): number {
        if (depth > 3) return 0
        let count = 1
        for (const child of Array.from(el.children)) count += walk(child, depth + 1)
        return count
      }
      return walk(document.body, 0)
    })
    if (typeof result !== "number" || result < 1) throw new Error(`evaluate returned ${result}`)
  }))

  // Check 3: Section discovery
  results.push(await runCheck("section-discovery", async () => {
    if (!page) throw new Error("no page from previous check")
    const { handles } = await discoverSections(page)
    if (handles.length < 1) throw new Error(`found ${handles.length} sections`)
  }))

  // Check 4: Adapter loading
  results.push(await runCheck("adapter-loading", async () => {
    const adapterPath = ".ai/adapters/webflow.json"
    if (!existsSync(adapterPath)) throw new Error("webflow.json adapter not found")
    const adapter = loadAdapters([adapterPath])
    if (!adapter.platforms.includes("webflow")) throw new Error("adapter parse failed")
  }))

  // Check 5: Import all core modules (catches missing exports, syntax errors)
  results.push(await runCheck("import-styles-core", async () => {
    await import("./lib/extract-styles-core.ts")
  }))

  results.push(await runCheck("import-images-core", async () => {
    await import("./lib/extract-images-core.ts")
  }))

  results.push(await runCheck("import-animations-core", async () => {
    await import("./lib/extract-animations-core.ts")
  }))

  // Check 6: Guardrail smoke test
  results.push(await runCheck("guardrail-smoke", async () => {
    const reference: GuardrailSection[] = [
      {
        index: 0,
        label: "navbar",
        semanticRole: "nav",
        classHint: "navbar",
        firstHeading: "",
        tag: "nav",
        bounds: { x: 0, y: 0, width: 1440, height: 88 },
        hasVideo: false,
        hasBackgroundImage: false,
        hasInteractiveLinks: true,
      },
      {
        index: 1,
        label: "hero",
        semanticRole: "hero",
        classHint: "hero",
        firstHeading: "Meet your partner in time",
        tag: "section",
        bounds: { x: 0, y: 88, width: 1440, height: 920 },
        hasVideo: true,
        hasBackgroundImage: true,
        hasInteractiveLinks: true,
      },
      {
        index: 2,
        label: "footer-shell",
        semanticRole: "footer",
        classHint: "footer-shell",
        firstHeading: "",
        tag: "footer",
        bounds: { x: 0, y: 4200, width: 1440, height: 480 },
        hasVideo: false,
        hasBackgroundImage: false,
        hasInteractiveLinks: true,
      },
    ]
    const manifest = reference.slice(0, 2)

    const coverage = summarizeExtractionCoverage(reference, manifest)
    if (coverage.passed) throw new Error("expected missing footer to fail extraction coverage")
    if (!coverage.missingRequiredRoles.includes("footer")) {
      throw new Error(`expected missing footer, got ${coverage.missingRequiredRoles.join(", ") || "none"}`)
    }

    const baseline = summarizeBuildBaseline({
      manifest,
      local: manifest.map((section) => ({ ...section })),
    })
    if (!baseline.passed) throw new Error("expected matching manifest/local roles to pass baseline")
    if (baseline.failureCode !== null) {
      throw new Error(`expected no baseline failure code, got ${baseline.failureCode}`)
    }
  }))

  await browser.close()

  // Report
  console.log("Results:\n")
  let failed = 0
  for (const r of results) {
    const status = r.passed ? "PASS" : "FAIL"
    const time = `${r.duration}ms`
    console.log(`  ${status}  ${r.name.padEnd(30)} ${time}`)
    if (!r.passed) {
      console.log(`         ${r.error}`)
      failed++
    }
  }

  console.log(`\n${results.length - failed}/${results.length} checks passed.`)

  if (failed > 0) {
    console.error(`\nPreflight FAILED. Do not start migration until all checks pass.`)
    process.exit(1)
  } else {
    console.log(`\nPreflight PASSED. Safe to start migration.`)
  }
}

main().catch(err => {
  console.error("Preflight crashed:", err.message)
  if (err.message?.includes("Executable doesn't exist") || err.message?.includes("browserType.launch")) {
    console.error("\nPlaywright browsers not installed. Run:\n  pnpm exec playwright install chromium")
  }
  process.exit(1)
})
