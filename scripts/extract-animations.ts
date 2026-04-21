import { chromium } from "@playwright/test"
import { loadAdaptersFromArgs } from "./lib/adapter-loader.ts"
import { extractAnimationsFromPage, writeAnimationOutput } from "./lib/extract-animations-core.ts"

const TARGET_URL = process.argv[2] || "https://blazity.com"
const OUTPUT_DIR = process.argv[3] || "docs/specs/homepage"
const ADAPTER = loadAdaptersFromArgs()

async function main() {
  console.log(`Extracting animations from: ${TARGET_URL}`)
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  const result = await extractAnimationsFromPage(page, ADAPTER, {
    skipPageLoad: false,
    url: TARGET_URL,
  })

  writeAnimationOutput(result, OUTPUT_DIR)

  await browser.close()
  const totalAnims = result.sections.reduce((sum, s) => sum + s.animations.length, 0)
  console.log(`\nDone! ${totalAnims} animations extracted`)
}

main().catch(console.error)
