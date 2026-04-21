/**
 * Full-page golden-file visual verification for SPA sites.
 *
 * Compares the LOCAL Next.js site against full-page golden screenshots
 * captured during extraction. No reference site navigation needed.
 *
 * Usage:
 *   pnpm ts scripts/verify-visual-golden-spa.ts \
 *     --golden-dir docs/golden-screenshots \
 *     --flow .ai/flows/<name>.spa.json \
 *     --local-port 3000 \
 *     --viewport 1440x900 \
 *     [--step <step-name>]
 */

import { chromium } from "@playwright/test"
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "fs"
import { join } from "path"
import { PNG } from "pngjs"
import pixelmatch from "pixelmatch"
import { freezeDynamicContent, dismissCookies } from "./lib/freeze.ts"

const args = process.argv.slice(2)
function getFlag(name: string) {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined
}

const GOLDEN_DIR = getFlag("golden-dir") || "docs/golden-screenshots"
const FLOW_PATH = getFlag("flow")
const LOCAL_PORT = getFlag("local-port") || "3000"
const viewportFlag = getFlag("viewport")
const VIEWPORT = viewportFlag
  ? { width: parseInt(viewportFlag.split("x")[0]), height: parseInt(viewportFlag.split("x")[1]) }
  : { width: 1440, height: 900 }
const STEP_FILTER = getFlag("step") || null

if (!FLOW_PATH) {
  console.error("Usage: pnpm ts scripts/verify-visual-golden-spa.ts --flow <flow.spa.json> --local-port <port> [--golden-dir <dir>] [--viewport WxH] [--step <name>]")
  process.exit(1)
}

if (isNaN(VIEWPORT.width) || isNaN(VIEWPORT.height) || VIEWPORT.width <= 0 || VIEWPORT.height <= 0) {
  console.error("Invalid viewport. Use format: --viewport 1440x900")
  process.exit(1)
}

const OUTPUT_DIR = "docs/visual-diffs"
const viewportDir = `${VIEWPORT.width}x${VIEWPORT.height}`
const OUTPUT_SUBDIR = join(OUTPUT_DIR, viewportDir)
const MAX_DIFF_RATIO = 0.01

interface FlowStep {
  name: string
  type: "entry" | "flow-step"
  url?: string
  outputDir: string
  localRoute?: string
}

let flow: { name: string; steps: FlowStep[] }
try {
  flow = JSON.parse(readFileSync(FLOW_PATH!, "utf-8"))
} catch (err: unknown) {
  console.error(`Failed to parse flow: ${(err as Error).message}`)
  process.exit(1)
}

if (!flow.name || !Array.isArray(flow.steps)) {
  console.error("Invalid flow: missing name or steps")
  process.exit(1)
}

async function isErrorPage(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => {
    const title = document.title.toLowerCase()
    const body = document.body.innerText.slice(0, 500).toLowerCase()
    return title.includes("404") || title.includes("not found") ||
      body.includes("this page could not be found") || body.includes("application error")
  })
}

async function main() {
  if (existsSync(OUTPUT_SUBDIR)) rmSync(OUTPUT_SUBDIR, { recursive: true })
  mkdirSync(OUTPUT_SUBDIR, { recursive: true })

  console.log(`SPA Golden Verification (full-page): ${flow.name}`)
  console.log(`Viewport: ${VIEWPORT.width}x${VIEWPORT.height}`)
  console.log(`Golden dir: ${GOLDEN_DIR}`)
  console.log(`Local: http://localhost:${LOCAL_PORT}`)
  if (STEP_FILTER) console.log(`Step filter: ${STEP_FILTER}`)
  console.log()

  const browser = await chromium.launch()
  let totalPass = 0
  let totalFail = 0
  let totalSkipped = 0

  for (const step of flow.steps) {
    if (STEP_FILTER && step.name !== STEP_FILTER) {
      totalSkipped++
      continue
    }

    console.log(`=== ${step.name} ===`)

    // Read golden full-page screenshot
    const goldenPath = join(GOLDEN_DIR, step.outputDir, viewportDir, "full-page.png")
    if (!existsSync(goldenPath)) {
      console.log(`  ⚠️ No golden screenshot at ${goldenPath} — skipping`)
      totalSkipped++
      continue
    }

    // Navigate local site
    const localRoute = step.localRoute
      || (step.type === "entry" ? new URL(step.url!).pathname : `/${step.outputDir.replace("checkout-", "checkout/")}`)

    const localPage = await browser.newPage({ viewport: VIEWPORT })
    await localPage.goto(`http://localhost:${LOCAL_PORT}${localRoute}`, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {})

    if (await isErrorPage(localPage)) {
      console.log(`  ❌ Local route ${localRoute} returned error page — skipping`)
      await localPage.close()
      totalFail++
      continue
    }

    await dismissCookies(localPage).catch(() => {})
    await freezeDynamicContent(localPage)

    // Full-page screenshot of local
    const localPath = join(OUTPUT_SUBDIR, `${step.name}-local.png`)
    await localPage.screenshot({ path: localPath, fullPage: true })
    await localPage.close()

    // Compare
    const goldenPng = PNG.sync.read(readFileSync(goldenPath))
    const localPng = PNG.sync.read(readFileSync(localPath))

    const w = Math.min(goldenPng.width, localPng.width)
    const h = Math.min(goldenPng.height, localPng.height)

    if (w === 0 || h === 0) {
      console.log(`  SKIP (0 size)`)
      totalSkipped++
      continue
    }

    // Log size mismatch if significant
    if (Math.abs(goldenPng.height - localPng.height) > 100) {
      console.log(`  ⚠️ Height mismatch: golden=${goldenPng.height}px, local=${localPng.height}px (diff=${Math.abs(goldenPng.height - localPng.height)}px)`)
    }

    const goldenResized = new PNG({ width: w, height: h })
    const localResized = new PNG({ width: w, height: h })
    PNG.bitblt(goldenPng, goldenResized, 0, 0, w, h, 0, 0)
    PNG.bitblt(localPng, localResized, 0, 0, w, h, 0, 0)

    const diff = new PNG({ width: w, height: h })
    const mismatch = pixelmatch(goldenResized.data, localResized.data, diff.data, w, h, { threshold: 0.1 })
    const ratio = mismatch / (w * h)
    const pct = (ratio * 100).toFixed(2)
    const status = ratio <= MAX_DIFF_RATIO ? "PASS" : "FAIL"

    if (status === "PASS") totalPass++
    else totalFail++

    const diffPath = join(OUTPUT_SUBDIR, `${step.name}-diff.png`)
    writeFileSync(diffPath, PNG.sync.write(diff))

    console.log(`  ${pct}% diff — ${status} (${w}x${h}px compared)`)
  }

  await browser.close()

  console.log(`\n${totalPass} passed, ${totalFail} failed, ${totalSkipped} skipped`)
  if (totalFail > 0) process.exit(1)
}

main().catch(err => {
  console.error("Verification failed:", err.message)
  process.exit(1)
})
