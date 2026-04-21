import { chromium } from "@playwright/test"
import { loadAdaptersFromArgs } from "./lib/adapter-loader.ts"
import { dismissCookieBanner } from "./lib/cookie-consent.ts"
import { extractSectionsAtViewport, assembleMultiViewportOutput, writeStyleOutput } from "./lib/extract-styles-core.ts"

const TARGET_URL = process.argv[2] || "https://blazity.com"
const OUTPUT_DIR = process.argv[3] || "docs/specs/homepage"
const viewportsFlag = process.argv.find(a => a.startsWith("--viewports="))?.split("=")[1]
  || (process.argv.indexOf("--viewports") >= 0 ? process.argv[process.argv.indexOf("--viewports") + 1] : undefined)
const VIEWPORTS = viewportsFlag
  ? viewportsFlag.split(",").map(Number)
  : [1440]
const selectorIdx = process.argv.indexOf("--selector")
const CUSTOM_SELECTOR = selectorIdx >= 0 ? process.argv[selectorIdx + 1] : undefined
const ADAPTER = loadAdaptersFromArgs()

async function main() {
  console.log(`Extracting styles from: ${TARGET_URL}`)
  console.log(`Output directory: ${OUTPUT_DIR}`)
  if (VIEWPORTS.length > 1) console.log(`Viewports: ${VIEWPORTS.join(", ")}`)

  const browser = await chromium.launch()
  const sortedViewports = [...VIEWPORTS].sort((a, b) => a - b)
  const largestViewport = sortedViewports[sortedViewports.length - 1]
  const viewportResults = []

  for (const vw of sortedViewports) {
    const context = await browser.newContext({ viewport: { width: vw, height: 900 } })
    const page = await context.newPage()
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 5000 })
    await dismissCookieBanner(page)
    await page.waitForTimeout(1000)

    const result = await extractSectionsAtViewport(page, vw, ADAPTER, {
      customSelector: CUSTOM_SELECTOR,
      isLargestViewport: vw === largestViewport,
    })
    viewportResults.push(result)
    await context.close()
  }

  const output = assembleMultiViewportOutput(viewportResults, VIEWPORTS, TARGET_URL, ".", ADAPTER)
  writeStyleOutput(output, OUTPUT_DIR)
  await browser.close()
}

main().catch(console.error)
