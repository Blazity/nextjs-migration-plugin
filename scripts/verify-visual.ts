import { chromium, type Page } from "@playwright/test"
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "fs"
import { join } from "path"
import { PNG } from "pngjs"
import pixelmatch from "pixelmatch"
import { freezeDynamicContent, dismissCookies } from "./lib/freeze.ts"
import { discoverSections } from "./lib/section-discovery.ts"
import { loadAdaptersFromArgs } from "./lib/adapter-loader.ts"
import { resolveLocalSiteAdapter } from "./lib/local-site-adapter.ts"
import type { DynamicMaskEntry, DynamicMasksOutput } from "./lib/extract-animations-core.ts"

// Parse named flags
const args = process.argv.slice(2)
function getFlag(name: string) {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined
}

const REFERENCE_URL = getFlag("ref") || args.find(a => !a.startsWith("--") && a.startsWith("http")) || "https://blazity.com"
const sectionFlag = getFlag("section")
const SECTION_FILTER = sectionFlag !== undefined ? parseInt(sectionFlag, 10) : null
const viewportFlag = getFlag("viewport")
const VIEWPORT = viewportFlag
  ? { width: parseInt(viewportFlag.split("x")[0]), height: parseInt(viewportFlag.split("x")[1]) }
  : { width: 1440, height: 900 }
const LOCAL_PORT = getFlag("local-port") || "3000"
const LOCAL_URL = getFlag("local") || (() => {
  const refPath = new URL(REFERENCE_URL).pathname
  return `http://localhost:${LOCAL_PORT}${refPath}`
})()
const OUTPUT_DIR = "docs/visual-diffs"
const viewportDir = `${VIEWPORT.width}x${VIEWPORT.height}`
const OUTPUT_SUBDIR = join(OUTPUT_DIR, viewportDir)
const MAX_DIFF_RATIO = (() => {
  const raw = getFlag("max-diff-percent")
  if (!raw) return 0.01
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid --max-diff-percent value: ${raw}`)
  }
  return parsed / 100
})()
const ADAPTER = loadAdaptersFromArgs()
const LOCAL_ADAPTER = resolveLocalSiteAdapter()
const freezeOpts = ADAPTER ? { localSite: ADAPTER.localSite } : undefined
const SPECS_DIR = getFlag("specs-dir")

const COUNT_ONLY = process.argv.includes("--count-only")
const SKIP_TAGS = new Set(["script", "noscript", "style", "link"])

// Load dynamic masks if available
function loadDynamicMasks(): DynamicMaskEntry[] {
  if (!SPECS_DIR) return []
  const masksPath = join(SPECS_DIR, "dynamic-masks.json")
  if (!existsSync(masksPath)) return []
  try {
    const data: DynamicMasksOutput = JSON.parse(readFileSync(masksPath, "utf8"))
    return data.masks ?? []
  } catch {
    return []
  }
}

function mergeAdapterDynamicElements(masks: DynamicMaskEntry[]): DynamicMaskEntry[] {
  const adapterElements = ADAPTER?.dynamicElements ?? []
  if (adapterElements.length === 0) return masks
  // Adapter-declared elements without bounding boxes are unresolvable at
  // verify time (no live page context to measure). They only serve as hints
  // during extraction. Return existing masks unchanged.
  return masks
}

const dynamicMasks = mergeAdapterDynamicElements(loadDynamicMasks())

function applyMasks(
  data: Buffer,
  width: number,
  height: number,
  masks: Array<{ boundingBox: { x: number; y: number; width: number; height: number } }>,
  sectionY: number,
) {
  const GRAY = 128
  for (const mask of masks) {
    const bb = mask.boundingBox
    const relY = bb.y - sectionY
    if (relY + bb.height < 0 || relY > height) continue

    const startY = Math.max(0, Math.floor(relY))
    const endY = Math.min(height, Math.ceil(relY + bb.height))
    const startX = Math.max(0, Math.floor(bb.x))
    const endX = Math.min(width, Math.ceil(bb.x + bb.width))

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const idx = (width * y + x) << 2
        data[idx] = GRAY
        data[idx + 1] = GRAY
        data[idx + 2] = GRAY
        data[idx + 3] = 255
      }
    }
  }
}

interface SectionShot {
  index: number
  label: string
  path: string
  height: number
  y: number
}

async function screenshotSections(
  page: Page,
  label: string,
  sectionFilter: number | null,
  isLocal: boolean
): Promise<SectionShot[]> {
  const localSelector = isLocal ? LOCAL_ADAPTER.localSite.sectionSelector : undefined
  const localDiscoveryAdapter = isLocal ? LOCAL_ADAPTER.sectionDiscovery : ADAPTER?.sectionDiscovery
  const hasMain = (await page.$("body > main")) !== null
  const allHandles = localSelector
    ? await page.$$(localSelector)
    : isLocal
      ? (await discoverSections(page, { adapter: localDiscoveryAdapter })).handles
      : hasMain
        ? await page.$$("body > header, body > nav, main > *, body > footer")
        : (await discoverSections(page, { adapter: ADAPTER?.sectionDiscovery })).handles
  const results: SectionShot[] = []

  for (let i = 0; i < allHandles.length; i++) {
    const handle = allHandles[i]
    const info = await handle.evaluate((node) => {
      const el = node as Element
      const rect = el.getBoundingClientRect()
      return {
        tag: el.tagName.toLowerCase(),
        height: rect.height,
        y: rect.y + window.scrollY,
        className: (el.className as unknown as string)?.toString?.() || "",
        heading: el.querySelector("h1, h2, h3")?.textContent?.trim().slice(0, 30) || "",
      }
    })

    if (SKIP_TAGS.has(info.tag) || info.height < 10) continue

    const classHint = info.className
      .split(" ")
      .find((c: string) =>
        c.startsWith("section_") || c.startsWith("section-") ||
        c.includes("navbar") || c.includes("footer") || c.includes("banner")
      ) || info.tag

    const sectionLabel = classHint === "section" || classHint === "header"
      ? info.heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 25) || `section-${i}`
      : classHint.replace(/^section_/, "").replace(/_/g, "-")

    const currentIndex = results.length
    const paddedIndex = String(currentIndex + 1).padStart(2, "0")
    const fileName = `${paddedIndex}-${sectionLabel}-${label}.png`
    const filePath = join(OUTPUT_SUBDIR, fileName)

    // Optimization: only screenshot the target section if filter is set
    if (sectionFilter !== null && currentIndex !== sectionFilter) {
      // Still count this section (for index alignment) but skip screenshotting
      results.push({ index: currentIndex, label: sectionLabel, path: "", height: Math.round(info.height), y: Math.round(info.y) })
      continue
    }

    await handle.screenshot({ path: filePath })
    results.push({ index: currentIndex, label: sectionLabel, path: filePath, height: Math.round(info.height), y: Math.round(info.y) })
  }

  return results
}

async function main() {
  mkdirSync(OUTPUT_SUBDIR, { recursive: true })
  console.log(`Visual comparison: ${REFERENCE_URL} vs ${LOCAL_URL}\n`)

  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: VIEWPORT })

  if (COUNT_ONLY) {
    const refPage = await context.newPage()
    await refPage.goto(REFERENCE_URL, { waitUntil: "domcontentloaded", timeout: 30000 })
    await dismissCookies(refPage, freezeOpts)
    await refPage.waitForTimeout(500)
    const hasMain = (await refPage.$("body > main")) !== null
    const allHandles = hasMain
      ? await refPage.$$("body > header, body > nav, main > *, body > footer")
      : (await discoverSections(refPage, { adapter: ADAPTER?.sectionDiscovery })).handles

    let count = 0
    for (const handle of allHandles) {
      const info = await handle.evaluate((node) => {
        const el = node as Element
        return { tag: el.tagName.toLowerCase(), height: el.getBoundingClientRect().height }
      })
      if (!SKIP_TAGS.has(info.tag) && info.height >= 10) count++
    }

    console.log(JSON.stringify({ sectionCount: count }))
    await browser.close()
    return
  }

  // Reference: check if cached screenshots exist (reuse across iterations)
  let refShots: SectionShot[] = []
  let needsRefScreenshot = true

  if (SECTION_FILTER !== null) {
    const cachedFiles = existsSync(OUTPUT_SUBDIR)
      ? readDirSafe(OUTPUT_SUBDIR).filter(f => f.endsWith("-reference.png"))
      : []

    if (cachedFiles.length > 0) {
      const cacheMeta = readCacheMeta(OUTPUT_SUBDIR)
      if (cacheMeta.referenceUrl && cacheMeta.referenceUrl !== REFERENCE_URL) {
        console.log(`Cache stale: was ${cacheMeta.referenceUrl}, now ${REFERENCE_URL} — recapturing`)
        for (const f of cachedFiles) unlinkSync(join(OUTPUT_SUBDIR, f))
      } else {
        refShots = cachedFiles.map((f, i) => {
          const label = f.replace(/^\d+-/, "").replace(/-reference\.png$/, "")
          return { index: i, label, path: join(OUTPUT_SUBDIR, f), height: 0, y: 0 }
        })

        if (refShots[SECTION_FILTER] && existsSync(refShots[SECTION_FILTER].path)) {
          needsRefScreenshot = false
          console.log(`Reference: using cached screenshots (${cachedFiles.length} sections)`)
        }
      }
    }
  }

  if (needsRefScreenshot) {
    const refPage = await context.newPage()
    await refPage.goto(REFERENCE_URL, { waitUntil: "domcontentloaded", timeout: 30000 })
    await dismissCookies(refPage, freezeOpts)
    await refPage.waitForTimeout(500)
    await freezeDynamicContent(refPage, freezeOpts)
    refShots = await screenshotSections(refPage, "reference", SECTION_FILTER, false)
    console.log(`Reference: ${refShots.filter(s => s.path).length} sections captured`)
    await refPage.close()
    writeCacheMeta(OUTPUT_SUBDIR, REFERENCE_URL)
  }

  const localPage = await context.newPage()
  await localPage.goto(LOCAL_URL, { waitUntil: "networkidle", timeout: 30000 })
  await dismissCookies(localPage, freezeOpts)
  await localPage.reload({ waitUntil: "networkidle" })
  await localPage.waitForTimeout(500)
  await freezeDynamicContent(localPage, freezeOpts)
  const localShots = await screenshotSections(localPage, "local", SECTION_FILTER, true)
  console.log(`Local: ${localShots.filter(s => s.path).length} sections captured\n`)

  if (dynamicMasks.length > 0) {
    console.log(`Dynamic masks: ${dynamicMasks.length} regions loaded\n`)
  }

  const maxLen = Math.min(refShots.length, localShots.length)
  let passCount = 0
  let failCount = 0

  for (let i = 0; i < maxLen; i++) {
    if (SECTION_FILTER !== null && i !== SECTION_FILTER) continue

    const ref = refShots[i]
    const local = localShots[i]

    if (!ref?.path || !local?.path || !existsSync(ref.path) || !existsSync(local.path)) {
      console.log(`[section-${i}] SKIP — missing screenshot`)
      continue
    }

    const refPng = PNG.sync.read(readFileSync(ref.path))
    const localPng = PNG.sync.read(readFileSync(local.path))

    const width = Math.min(refPng.width, localPng.width)
    const height = Math.min(refPng.height, localPng.height)

    if (width === 0 || height === 0) {
      console.log(`[${ref.label}] SKIP — zero dimensions`)
      continue
    }

    const refCropped = new PNG({ width, height })
    PNG.bitblt(refPng, refCropped, 0, 0, width, height, 0, 0)
    const localCropped = new PNG({ width, height })
    PNG.bitblt(localPng, localCropped, 0, 0, width, height, 0, 0)

    // Filter masks that overlap this section
    const sectionY = ref.y || local.y
    const sectionMasks = dynamicMasks.filter(m => {
      const bb = m.boundingBox
      const relY = bb.y - sectionY
      return relY + bb.height > 0 && relY < height
    })

    if (sectionMasks.length > 0) {
      // Masked comparison (pass/fail criterion)
      const refMaskedData = Buffer.from(refCropped.data)
      const localMaskedData = Buffer.from(localCropped.data)
      applyMasks(refMaskedData, width, height, sectionMasks, sectionY)
      applyMasks(localMaskedData, width, height, sectionMasks, sectionY)

      const maskedDiff = new PNG({ width, height })
      const maskedDiffPixels = pixelmatch(
        refMaskedData, localMaskedData, maskedDiff.data,
        width, height,
        { threshold: 0.1 }
      )

      // Unmasked comparison (informational)
      const unmaskedDiff = new PNG({ width, height })
      const unmaskedDiffPixels = pixelmatch(
        refCropped.data, localCropped.data, unmaskedDiff.data,
        width, height,
        { threshold: 0.1 }
      )

      const totalPixels = width * height
      const maskedRatio = maskedDiffPixels / totalPixels
      const unmaskedRatio = unmaskedDiffPixels / totalPixels
      const pass = maskedRatio <= MAX_DIFF_RATIO

      if (pass) {
        passCount++
        console.log(`[${ref.label}] PASS — ${(maskedRatio * 100).toFixed(2)}% diff (masked, ${sectionMasks.length} dynamic regions), ${(unmaskedRatio * 100).toFixed(2)}% diff (unmasked)`)
      } else {
        failCount++
        const diffPath = join(OUTPUT_SUBDIR, `${String(i + 1).padStart(2, "0")}-${ref.label}-diff.png`)
        writeFileSync(diffPath, PNG.sync.write(maskedDiff))
        console.log(`[${ref.label}] FAIL — ${(maskedRatio * 100).toFixed(2)}% diff (masked, ${sectionMasks.length} dynamic regions), ${(unmaskedRatio * 100).toFixed(2)}% diff (unmasked) → ${diffPath}`)
      }
    } else {
      const diff = new PNG({ width, height })
      const diffPixels = pixelmatch(
        refCropped.data, localCropped.data, diff.data,
        width, height,
        { threshold: 0.1 }
      )

      const totalPixels = width * height
      const diffRatio = diffPixels / totalPixels
      const pass = diffRatio <= MAX_DIFF_RATIO

      if (pass) {
        passCount++
        console.log(`[${ref.label}] PASS — ${(diffRatio * 100).toFixed(2)}% diff`)
      } else {
        failCount++
        const diffPath = join(OUTPUT_SUBDIR, `${String(i + 1).padStart(2, "0")}-${ref.label}-diff.png`)
        writeFileSync(diffPath, PNG.sync.write(diff))
        console.log(`[${ref.label}] FAIL — ${(diffRatio * 100).toFixed(2)}% diff (${diffPixels} pixels) → ${diffPath}`)
      }
    }
  }

  if (refShots.length !== localShots.length) {
    console.log(`\nWARNING: Section count mismatch (ref: ${refShots.length}, local: ${localShots.length})`)
  }

  console.log(`\nResults: ${passCount} pass, ${failCount} fail out of ${maxLen} sections`)
  await browser.close()

  process.exit(failCount > 0 ? 1 : 0)
}

function readDirSafe(dir: string): string[] {
  try {
    return readdirSync(dir) as string[]
  } catch {
    return []
  }
}

function readCacheMeta(dir: string): { referenceUrl?: string } {
  const metaPath = join(dir, ".cache-meta.json")
  if (!existsSync(metaPath)) return {}
  try {
    return JSON.parse(readFileSync(metaPath, "utf8"))
  } catch {
    return {}
  }
}

function writeCacheMeta(dir: string, referenceUrl: string) {
  writeFileSync(join(dir, ".cache-meta.json"), JSON.stringify({ referenceUrl }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
