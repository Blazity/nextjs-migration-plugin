import { chromium } from "@playwright/test"
import { loadAdaptersFromArgs } from "./lib/adapter-loader.ts"
import { freezeDynamicContent } from "./lib/freeze.ts"
import { extractImagesFromPage, writeImageOutput } from "./lib/extract-images-core.ts"
import { installNameShim } from "./lib/playwright-eval-shim.ts"

const TARGET_URL = process.argv[2] || "https://blazity.com"
const pageFlag = process.argv.find(a => a.startsWith("--page="))?.split("=")[1]
  || (process.argv.indexOf("--page") >= 0 ? process.argv[process.argv.indexOf("--page") + 1] : undefined)
const PAGE_NAME = pageFlag || "homepage"
const ADAPTER = loadAdaptersFromArgs()

async function main() {
  console.log(`Extracting images from: ${TARGET_URL}`)
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await installNameShim(context)
  const page = await context.newPage()

  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 })
  // freezeDynamicContent activates the first tab on every w-tab/[role=tab] component,
  // scrolls for lazy-loaded images, freezes animations, and dismisses cookies.
  // Without this, the active tab during extraction is non-deterministic, so
  // `extract-images.ts` and `extract-styles.ts` can capture different tab panes,
  // producing structure refs that the image manifest can't resolve.
  await freezeDynamicContent(page, { localSite: ADAPTER?.localSite, extractionSafe: true })

  const result = await extractImagesFromPage(page, PAGE_NAME, ADAPTER)
  await writeImageOutput(result, "public/images", `docs/specs/${PAGE_NAME}`)

  await browser.close()
  console.log(`\nDone! ${result.totalImages} images extracted across ${result.sections.length} sections`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
