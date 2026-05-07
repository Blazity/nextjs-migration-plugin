/**
 * Flow-based extraction for stateful SPAs.
 *
 * Instead of navigating directly to each URL (which fails when pages require
 * session state), this script navigates through the real user flow — clicking
 * buttons, filling forms, waiting for navigation — and extracts specs at each step.
 *
 * Uses core extraction modules for full parity with direct extraction.
 *
 * Usage:
 *   pnpm ts scripts/extract-spa-flow.ts \
 *     --flow .ai/flows/ripleys-checkout.json \
 *     --output-dir docs/specs \
 *     --viewports 375,768,1024,1440 \
 *     [--adapter adapters/svelte.json --adapter adapters/directus-cms.json]
 *     [--timeout 300000]
 */

import { chromium, type Page } from "@playwright/test"
import { readFileSync, mkdirSync } from "fs"
import { join } from "path"
import { loadAdaptersFromArgs } from "./lib/adapter-loader.ts"
import { dismissCookieBanner } from "./lib/cookie-consent.ts"
import {
  extractSectionsMultiViewportResize,
  assembleMultiViewportOutput,
  writeStyleOutput,
} from "./lib/extract-styles-core.ts"
import { extractImagesFromPage, writeImageOutput } from "./lib/extract-images-core.ts"
import { extractAnimationsFromPage, writeAnimationOutput } from "./lib/extract-animations-core.ts"


// --- CLI args ---
function getNamedArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`)
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : undefined
}

const FLOW_PATH = getNamedArg("flow")
if (!FLOW_PATH) {
  console.error("Usage: pnpm ts scripts/extract-spa-flow.ts --flow <flow.json> --output-dir <dir> [--viewports 375,768,1024,1440] [--adapter ...] [--timeout 300000]")
  process.exit(1)
}
const OUTPUT_BASE = getNamedArg("output-dir") || "docs/specs"
const viewportsStr = getNamedArg("viewports") || "1440"
const VIEWPORTS = viewportsStr.split(",").map(Number)
const ADAPTER = loadAdaptersFromArgs()
const TIMEOUT = Number(getNamedArg("timeout") || "600000")

// Gap 11: Validate parsed CLI args
if (VIEWPORTS.some(v => isNaN(v) || v <= 0)) {
  console.error(`Invalid viewports: "${viewportsStr}". Use comma-separated numbers: --viewports 375,768,1024,1440`)
  process.exit(1)
}
if (isNaN(TIMEOUT) || TIMEOUT <= 0) {
  console.error(`Invalid timeout. Use milliseconds: --timeout 600000`)
  process.exit(1)
}

const GOLDEN_DIR = getNamedArg("golden-dir") || "docs/golden-screenshots"

// --- Flow definition types ---
interface FlowAction {
  type: "click" | "fill" | "waitForNavigation" | "wait" | "scroll"
  selector?: string
  value?: string
  urlPattern?: string
  duration?: number
  description?: string
}

interface FlowStep {
  name: string
  type: "entry" | "flow-step"
  url?: string
  extract: boolean
  terminal?: boolean
  outputDir: string
  waitFor?: { selector: string; text?: string; textNot?: string }
  contentValidation?: { mustContain?: string[]; mustNotContain?: string[] }
  actions?: FlowAction[]
}

interface FlowDefinition {
  name: string
  description?: string
  entryUrl: string
  steps: FlowStep[]
}

// --- Content validation ---
async function validateContent(page: Page, step: FlowStep): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = []

  if (step.waitFor) {
    const el = await page.$(step.waitFor.selector)
    if (!el) {
      errors.push(`waitFor selector "${step.waitFor.selector}" not found`)
    } else {
      const text = await el.evaluate(e => e.textContent || "")
      if (step.waitFor.text && !text.includes(step.waitFor.text)) {
        errors.push(`waitFor text "${step.waitFor.text}" not found in element (got: "${text.slice(0, 50)}")`)
      }
      if (step.waitFor.textNot && text.includes(step.waitFor.textNot)) {
        errors.push(`waitFor textNot "${step.waitFor.textNot}" found in element — page likely showing fallback content`)
      }
    }
  }

  if (step.contentValidation) {
    const bodyText = await page.evaluate(() => document.body.innerText)
    const lower = bodyText.toLowerCase()

    for (const term of step.contentValidation.mustContain ?? []) {
      if (!lower.includes(term.toLowerCase())) {
        errors.push(`mustContain "${term}" not found in page content`)
      }
    }
    for (const term of step.contentValidation.mustNotContain ?? []) {
      if (lower.includes(term.toLowerCase())) {
        errors.push(`mustNotContain "${term}" found in page content — likely fallback`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

// --- Action execution ---
async function executeAction(page: Page, action: FlowAction): Promise<boolean> {
  switch (action.type) {
    case "click": {
      console.log(`  Action: click "${action.selector}"`)
      const target = await page.$(action.selector!)
      if (!target) {
        console.warn(`  Selector "${action.selector}" not found`)
        return false
      }
      // Use evaluate click — robust against overflow:hidden and out-of-viewport elements
      await target.evaluate((el: Element) => (el as HTMLElement).click())
      await page.waitForTimeout(1000)
      return true
    }
    case "fill":
      console.log(`  Action: fill "${action.selector}" with "${action.value}"`)
      await page.fill(action.selector!, action.value!)
      return true
    case "waitForNavigation":
      console.log(`  Action: wait for navigation to ${action.urlPattern}`)
      await page.waitForURL(`**${action.urlPattern}*`, { timeout: 15000 })
      await page.waitForTimeout(2000)
      return true
    case "wait":
      await page.waitForTimeout(action.duration || 1000)
      return true
    case "scroll":
      console.log(`  Action: scroll to bottom`)
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(500)
      return true
  }
}

// --- Golden screenshot capture ---
const VIEWPORT_HEIGHTS: Record<number, number> = {
  375: 812,
  768: 1024,
  1024: 900,
  1440: 900,
}

async function captureGoldenScreenshots(
  page: Page,
  stepName: string,
  viewports: number[]
): Promise<void> {
  const originalViewport = page.viewportSize()

  for (const vw of viewports) {
    const vh = VIEWPORT_HEIGHTS[vw] ?? 900
    const vpDir = join(GOLDEN_DIR, stepName, `${vw}x${vh}`)
    mkdirSync(vpDir, { recursive: true })

    await page.setViewportSize({ width: vw, height: vh })
    await page.waitForTimeout(500)

    // Full-page screenshot — avoids section alignment issues between SPA and Next.js
    await page.screenshot({ path: join(vpDir, "full-page.png"), fullPage: true })
    console.log(`    Golden: ${stepName} at ${vw}x${vh} — full-page screenshot`)
  }

  if (originalViewport) {
    await page.setViewportSize(originalViewport)
    await page.waitForTimeout(300)
  }
}

// --- Flow execution ---
async function executeFlow(flow: FlowDefinition): Promise<void> {
  const startTime = Date.now()
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  let stepsFailed = 0

  for (let si = 0; si < flow.steps.length; si++) {
    if (Date.now() - startTime > TIMEOUT) {
      console.error(`\nFlow timeout (${TIMEOUT}ms). Stopping after step ${si - 1}.`)
      break
    }

    const step = flow.steps[si]
    console.log(`\nStep ${si}/${flow.steps.length - 1}: ${step.name} (${step.type}${step.terminal ? ", terminal" : ""})`)

    // Navigate for entry steps
    if (step.type === "entry" && step.url) {
      console.log(`  Navigating to: ${step.url}`)
      await page.goto(step.url, { waitUntil: "domcontentloaded", timeout: 30000 })
      await page.waitForTimeout(2000)
    }

    // Dismiss cookies using universal cookie consent module
    await dismissCookieBanner(page)

    // Validate content
    const validation = await validateContent(page, step)
    if (!validation.valid) {
      console.error(`  VALIDATION FAILED for step "${step.name}":`)
      for (const err of validation.errors) console.error(`    - ${err}`)
      stepsFailed++
      if (step.type === "flow-step") {
        console.error(`  HALT: Cannot extract page with fallback content.`)
        break
      }
      // Gap 6: Entry step validation failed but not halting — log clearly
      console.warn(`  WARNING: Entry step "${step.name}" has validation issues but continuing extraction.`)
    }

    // Extract using core functions
    if (step.extract && validation.valid) {
      const outputDir = join(OUTPUT_BASE, step.outputDir)
      console.log(`  Extracting to: ${outputDir}`)

      // Styles (multi-viewport via resize)
      const viewportResults = await extractSectionsMultiViewportResize(page, VIEWPORTS, ADAPTER)
      const styleOutput = assembleMultiViewportOutput(
        Array.from(viewportResults.values()), VIEWPORTS, page.url(), ".", ADAPTER, "spa-flow-resize"
      )
      writeStyleOutput(styleOutput, outputDir)
      console.log(`    Styles: ${styleOutput.sections.length} sections at ${VIEWPORTS.length} viewports`)

      // Images (at largest viewport, already restored by resize function)
      const imageResult = await extractImagesFromPage(page, step.outputDir, ADAPTER, { scrollForLazy: true })
      const domain = new URL(page.url()).hostname.replace(/^www\./, "")
      await writeImageOutput(imageResult, `public/images/${domain}/${step.outputDir}`, outputDir)
      console.log(`    Images: ${imageResult.totalImages} images`)

      // Animations (skip page-load, can't re-navigate)
      const animResult = await extractAnimationsFromPage(page, ADAPTER, { skipPageLoad: true })
      writeAnimationOutput(animResult, outputDir)
      const totalAnims = animResult.sections.reduce((s, sec) => s + sec.animations.length, 0)
      console.log(`    Animations: ${totalAnims} entries`)

      // Capture golden screenshots for visual verification
      await captureGoldenScreenshots(page, step.outputDir, VIEWPORTS)
    }

    // Execute actions (skip if terminal)
    if (step.actions && !step.terminal) {
      // Ensure viewport is at 1440 and DOM is settled before executing actions
      const vp = page.viewportSize()
      if (vp && vp.width !== 1440) {
        await page.setViewportSize({ width: 1440, height: 900 })
      }
      await page.waitForTimeout(2000)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(500)

      let actionFailed = false
      for (const action of step.actions) {
        try {
          const ok = await executeAction(page, action)
          if (!ok && (action.type === "click" || action.type === "waitForNavigation")) {
            actionFailed = true
            break
          }
        } catch (err: any) {
          console.warn(`  Action "${action.type}" failed: ${err.message?.slice(0, 100)}`)
          if (action.type === "waitForNavigation" || action.type === "click") {
            actionFailed = true
            break
          }
        }
      }
      if (actionFailed) {
        console.error(`  Critical action failed. Cannot continue flow.`)
        stepsFailed++
        break
      }
    } else if (step.terminal) {
      console.log(`  Terminal step — skipping actions.`)
      break
    }
  }

  await browser.close()
  const timedOut = Date.now() - startTime > TIMEOUT
  console.log(`\nFlow complete: ${flow.steps.length - stepsFailed}/${flow.steps.length} steps succeeded`)
  console.log(`Total time: ${Math.round((Date.now() - startTime) / 1000)}s`)
  if (timedOut) console.error(`WARNING: Flow timed out — not all steps may have completed.`)
  if (stepsFailed > 0 || timedOut) process.exit(1)
}

// --- Main ---
let flow: FlowDefinition
try {
  flow = JSON.parse(readFileSync(FLOW_PATH, "utf-8"))
} catch (err: unknown) {
  console.error(`Failed to parse flow file "${FLOW_PATH}": ${(err as Error).message}`)
  process.exit(1)
}
if (!flow.name || !flow.entryUrl || !Array.isArray(flow.steps) || flow.steps.length === 0) {
  console.error(`Invalid flow: missing required fields (name, entryUrl, steps). Check ${FLOW_PATH}`)
  process.exit(1)
}
for (const step of flow.steps) {
  if (!step.name || !step.type || !step.outputDir) {
    console.error(`Invalid flow step: missing name, type, or outputDir in step "${step.name || '(unnamed)'}". Check ${FLOW_PATH}`)
    process.exit(1)
  }
}
console.log(`Flow: ${flow.name}`)
console.log(`Steps: ${flow.steps.length}`)
console.log(`Output: ${OUTPUT_BASE}`)
console.log(`Viewports: ${VIEWPORTS.join(", ")}`)
if (ADAPTER) console.log(`Adapters: ${ADAPTER.platforms.join(" + ")}`)

executeFlow(flow).catch(err => {
  console.error("Flow execution failed:", err.message)
  process.exit(1)
})
