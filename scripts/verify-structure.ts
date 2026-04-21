import { chromium } from "@playwright/test"
import { loadAdaptersFromArgs } from "./lib/adapter-loader.ts"
import { resolveLocalSiteAdapter } from "./lib/local-site-adapter.ts"
import { snapshotStructuralSections } from "./lib/structure-snapshot.ts"

const REFERENCE_URL = process.argv[2] || "https://blazity.com"
const LOCAL_URL = process.argv[3] || "http://localhost:3000"

const adapter = loadAdaptersFromArgs()
const localAdapter = resolveLocalSiteAdapter()

async function extractSections(
  page: Parameters<typeof snapshotStructuralSections>[0],
  options?: Parameters<typeof snapshotStructuralSections>[1]
) {
  return snapshotStructuralSections(page, options)
}

async function main() {
  console.log(`Structural comparison: ${REFERENCE_URL} vs ${LOCAL_URL}\n`)

  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })

  const refPage = await context.newPage()
  await refPage.goto(REFERENCE_URL, { waitUntil: "domcontentloaded", timeout: 30000 })
  await refPage.click('[data-cc="accept"]').catch(() => {})
  await refPage.waitForTimeout(1000)
  const refSections = await extractSections(refPage, {
    adapter: adapter?.sectionDiscovery,
  })

  const localPage = await context.newPage()
  await localPage.goto(LOCAL_URL, { waitUntil: "domcontentloaded", timeout: 30000 })
  await localPage.evaluate(() => {
    document.cookie = "cookie-consent=" + JSON.stringify({necessary:true,analytics:true,marketing:true}) + ";path=/;max-age=31536000"
  })
  await localPage.reload({ waitUntil: "domcontentloaded" })
  await localPage.waitForTimeout(1000)
  const localSections = await extractSections(localPage, {
    adapter: localAdapter.sectionDiscovery,
    customSelector: localAdapter.localSite.sectionSelector,
  })

  console.log(`Reference: ${refSections.length} sections`)
  console.log(`Local:     ${localSections.length} sections\n`)

  const maxLen = Math.max(refSections.length, localSections.length)

  for (let i = 0; i < maxLen; i++) {
    const ref = refSections[i]
    const local = localSections[i]

    if (!ref) {
      console.log(`[${i}] EXTRA locally: ${local?.classHint} (${local?.bounds.height}px)`)
      continue
    }
    if (!local) {
      console.log(
        `[${i}] MISSING locally: ${ref.classHint} (${ref.bounds.height}px) — heading: ${ref.firstHeading}`
      )
      continue
    }

    const heightDiff = Math.abs(ref.bounds.height - local.bounds.height)
    const heightPct = ref.bounds.height > 0 ? Math.round((heightDiff / ref.bounds.height) * 100) : 0
    const pass = heightPct <= 20

    console.log(
      `[${i}] ${pass ? "PASS" : "FAIL"} | ref: ${ref.classHint} (${ref.bounds.height}px) | local: ${local.classHint} (${local.bounds.height}px) | diff: ${heightPct}%`
    )
    if (ref.firstHeading) {
      console.log(`      ref heading: ${ref.firstHeading}`)
    }
    if (local.firstHeading) {
      console.log(`      local heading: ${local.firstHeading}`)
    }
  }

  await browser.close()
}

main().catch(console.error)
