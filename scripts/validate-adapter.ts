import { chromium } from "@playwright/test"
import { readFileSync, writeFileSync } from "fs"
import { discoverSections } from "./lib/section-discovery.ts"
import { dismissCookies } from "./lib/freeze.ts"

const adapterPath = process.argv[2]
if (!adapterPath) {
  console.error("Usage: pnpm ts scripts/validate-adapter.ts <adapter-path>")
  console.error("  Validates an adapter against its validation.sites list.")
  console.error("  Framework adapters: probe + section discovery (3-30 sections = pass)")
  console.error("  CMS adapters: probe detection only")
  process.exit(1)
}

const adapter = JSON.parse(readFileSync(adapterPath, "utf8"))
const sites: string[] = adapter.validation?.sites ?? []

if (sites.length === 0) {
  console.error(`FAIL: ${adapterPath} has no validation.sites array. Add 10 sites first.`)
  process.exit(1)
}

if (sites.length < 10) {
  console.error(`WARN: ${adapterPath} has only ${sites.length} validation sites (10 required).`)
}

const isFramework = adapter.type === "framework"
const platform = adapter.platform as string

interface SiteResult {
  url: string
  detected: boolean
  sections: number | null
  pass: boolean
  error: string | null
}

async function probeDetection(page: any): Promise<boolean> {
  const detection = adapter.detection
  // Check meta generator
  if (detection.metaGenerator) {
    const gen = await page.$eval('meta[name="generator"]', (el: any) => el.content).catch(() => "")
    if (gen && gen.startsWith(detection.metaGenerator)) return true
  }
  // Check DOM markers
  for (const selector of detection.domMarkers ?? []) {
    const found = await page.$(selector)
    if (found) return true
  }
  // Check JS markers
  for (const expr of detection.jsMarkers ?? []) {
    try {
      const result = await page.evaluate(expr)
      if (result) return true
    } catch {}
  }
  // Check URL patterns in page source
  const html = await page.content()
  for (const pattern of detection.urlPatterns ?? []) {
    if (new RegExp(pattern).test(html)) return true
  }
  return false
}

async function main() {
  console.log(`Validating ${adapterPath} (${platform}, ${adapter.type})`)
  console.log(`Sites: ${sites.length}\n`)

  const browser = await chromium.launch()
  const results: SiteResult[] = []

  for (const url of sites) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
    } catch {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 })
        await page.waitForTimeout(3000)
      } catch (e) {
        results.push({ url, detected: false, sections: null, pass: false, error: `unreachable: ${e}` })
        await ctx.close()
        continue
      }
    }
    await dismissCookies(page, {})
    await page.waitForTimeout(500)

    const detected = await probeDetection(page)

    let sections: number | null = null
    if (isFramework && detected) {
      try {
        const discovery = await discoverSections(page, {
          quiet: true,
          adapter: adapter.sectionDiscovery,
        })
        sections = discovery.handles.length
      } catch (e) {
        results.push({ url, detected, sections: null, pass: false, error: `discovery failed: ${e}` })
        await ctx.close()
        continue
      }
    }

    const pass = isFramework
      ? detected && sections !== null && sections >= 3 && sections <= 30
      : detected

    results.push({ url, detected, sections, pass, error: null })
    await ctx.close()
  }

  await browser.close()

  // Print results table
  console.log("Results:\n")
  console.log("  URL".padEnd(50) + "Detected".padEnd(12) + (isFramework ? "Sections".padEnd(12) : "") + "Status")
  console.log("  " + "-".repeat(isFramework ? 80 : 68))

  for (const r of results) {
    const det = r.detected ? "YES" : "NO"
    const sec = r.sections !== null ? String(r.sections) : "-"
    const status = r.pass ? "PASS" : `FAIL${r.error ? ` (${r.error})` : ""}`
    const urlShort = r.url.length > 45 ? r.url.slice(0, 42) + "..." : r.url
    console.log(`  ${urlShort.padEnd(48)}${det.padEnd(12)}${isFramework ? sec.padEnd(12) : ""}${status}`)
  }

  const passed = results.filter(r => r.pass).length
  const total = results.length
  const threshold = isFramework ? 8 : 10

  console.log(`\n${passed}/${total} passed (threshold: ${threshold}/${total})`)

  // Update adapter with results
  adapter.validation = adapter.validation || {}
  adapter.validation.lastValidated = new Date().toISOString().split("T")[0]
  adapter.validation.results = {
    passed,
    failed: total - passed,
    ...(isFramework ? { sections: results.map(r => r.sections) } : {}),
  }
  writeFileSync(adapterPath, JSON.stringify(adapter, null, 2) + "\n")

  if (passed < threshold) {
    console.log(`\nFAIL: ${passed}/${total} < ${threshold} required.`)
    process.exit(1)
  } else {
    console.log(`\nPASS: adapter validated.`)
    process.exit(0)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
