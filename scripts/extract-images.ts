import { chromium } from "@playwright/test"
import { loadAdaptersFromArgs } from "./lib/adapter-loader.ts"
import { dismissCookieBanner } from "./lib/cookie-consent.ts"
import { extractImagesFromPage, writeImageOutput } from "./lib/extract-images-core.ts"

const TARGET_URL = process.argv[2] || "https://blazity.com"
const pageFlag = process.argv.find(a => a.startsWith("--page="))?.split("=")[1]
  || (process.argv.indexOf("--page") >= 0 ? process.argv[process.argv.indexOf("--page") + 1] : undefined)
const PAGE_NAME = pageFlag || "homepage"
const ADAPTER = loadAdaptersFromArgs()

async function main() {
  console.log(`Extracting images from: ${TARGET_URL}`)
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 })
  await dismissCookieBanner(page)
  await page.waitForTimeout(1000)

  const result = await extractImagesFromPage(page, PAGE_NAME, ADAPTER)
  const domain = new URL(TARGET_URL).hostname.replace(/^www\./, "")
  await writeImageOutput(result, `public/images/${domain}/${PAGE_NAME}`, `docs/specs/${PAGE_NAME}`)

  await browser.close()
  console.log(`\nDone! ${result.totalImages} images extracted across ${result.sections.length} sections`)
}

main().catch(console.error)
