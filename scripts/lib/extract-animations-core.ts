import type { Page, ElementHandle } from "@playwright/test"
import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { discoverSections } from "./section-discovery.ts"
import type { MergedAdapter } from "./adapter-loader.ts"
import { dismissCookieBanner } from "./cookie-consent.ts"
import { deriveSectionLabel } from "./extract-styles-core.ts"

export interface DynamicMaskEntry {
  selector: string
  reason: string
  boundingBox: { x: number; y: number; width: number; height: number }
  sectionIndex: number
}

export interface DynamicMasksOutput {
  version: 1
  viewport: { width: number; height: number }
  masks: DynamicMaskEntry[]
}

export interface AnimationEntry {
  trigger: "scroll-into-view" | "page-load" | "hover" | "continuous"
  target: string
  from: Record<string, string>
  to: Record<string, string>
  estimatedDuration?: number
  type?: string
  details?: Record<string, unknown>
}

export interface SectionAnimations {
  index: number
  label: string
  animations: AnimationEntry[]
  transitionTimings: { selector: string; duration: string; easing: string }[]
}

export interface AnimationExtractionResult {
  sections: SectionAnimations[]
  pageLoadAnimations: AnimationEntry[] | "unavailable-flow-mode"
  dynamicMasks?: DynamicMasksOutput
}

export const ANIMATION_PROPS = ["opacity", "transform", "visibility"]

export async function getSectionHandles(page: Page, adapter: MergedAdapter | null) {
  const { handles } = await discoverSections(page, { adapter: adapter?.sectionDiscovery })
  const result: { handle: ElementHandle; label: string; index: number }[] = []
  for (const handle of handles) {
    const info = await handle.evaluate((node) => {
      const el = node as Element
      return {
        className: (el.className as unknown as string)?.toString?.() || "",
        heading: el.querySelector("h1, h2, h3")?.textContent?.trim().slice(0, 30) || "",
        tag: el.tagName.toLowerCase(),
      }
    })
    const label = deriveSectionLabel(info.className, info.tag, info.heading, result.length)
    result.push({ handle, label, index: result.length })
  }
  return result
}

export function selectorFor(tag: string, className: string, text: string): string {
  const cls = className.split(" ").filter(c => c && !c.startsWith("w-")).slice(0, 2).join(".")
  const sel = cls ? `${tag}.${cls}` : tag
  return text ? `${sel} "${text.slice(0, 30)}"` : sel
}

export interface ElementSnapshot {
  tag: string
  className: string
  text: string
  styles: Record<string, string>
}

export async function evalSnapshot(handle: ElementHandle, depth: 2 | 3): Promise<ElementSnapshot[]> {
  return handle.evaluate((section, maxDepth) => {
    const props = ["opacity", "transform", "visibility"]
    const results: { tag: string; className: string; text: string; styles: Record<string, string> }[] = []
    function walk(el: Element, d: number) {
      if (d > maxDepth) return
      const cs = window.getComputedStyle(el)
      const styles: Record<string, string> = {}
      for (const p of props) styles[p] = cs.getPropertyValue(p)
      results.push({ tag: el.tagName.toLowerCase(), className: el.className?.toString?.() || "", text: el.textContent?.trim().slice(0, 30) || "", styles })
      for (const child of Array.from(el.children)) walk(child, d + 1)
    }
    walk(section as Element, 0)
    return results
  }, depth)
}

export async function observeEntranceAnimations(page: Page, sectionHandle: ElementHandle): Promise<AnimationEntry[]> {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(500)

  const beforeData = await evalSnapshot(sectionHandle, 2)

  const urlBefore = page.url()
  await sectionHandle.scrollIntoViewIfNeeded()
  if (page.url() !== urlBefore) {
    console.warn(`  URL changed during scrollIntoView (${urlBefore} -> ${page.url()}), skipping section`)
    return []
  }
  const startTime = Date.now()
  await page.waitForTimeout(1500)
  const endTime = Date.now()

  const afterData = await evalSnapshot(sectionHandle, 2)

  const entries: AnimationEntry[] = []
  for (let i = 0; i < Math.min(beforeData.length, afterData.length); i++) {
    const before = beforeData[i]
    const after = afterData[i]
    const from: Record<string, string> = {}
    const to: Record<string, string> = {}
    let changed = false

    for (const prop of ANIMATION_PROPS) {
      if (before.styles[prop] !== after.styles[prop]) {
        from[prop] = before.styles[prop]
        to[prop] = after.styles[prop]
        changed = true
      }
    }

    if (changed) {
      entries.push({
        trigger: "scroll-into-view",
        target: selectorFor(after.tag, after.className, after.text),
        from,
        to,
        estimatedDuration: Math.min(endTime - startTime, 1500),
      })
    }
  }

  return entries
}

export async function observePageLoadAnimations(
  page: Page,
  url: string,
  adapter: MergedAdapter | null,
): Promise<{ sectionIndex: number; entries: AnimationEntry[] }[]> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
  await dismissCookieBanner(page)

  const sections = await getSectionHandles(page, adapter)
  const heroSection = sections.find(s => s.label.includes("architect") || s.label.includes("hero") || s.index <= 2)
  if (!heroSection) return []

  const beforeData = await evalSnapshot(heroSection.handle, 3)

  await page.waitForTimeout(2000)

  const afterData = await evalSnapshot(heroSection.handle, 3)

  const entries: AnimationEntry[] = []
  for (let i = 0; i < Math.min(beforeData.length, afterData.length); i++) {
    const before = beforeData[i]
    const after = afterData[i]
    const from: Record<string, string> = {}
    const to: Record<string, string> = {}
    let changed = false
    for (const prop of ANIMATION_PROPS) {
      if (before.styles[prop] !== after.styles[prop]) {
        from[prop] = before.styles[prop]
        to[prop] = after.styles[prop]
        changed = true
      }
    }
    if (changed) {
      entries.push({
        trigger: "page-load",
        target: selectorFor(after.tag, after.className, after.text),
        from, to,
        estimatedDuration: 2000,
      })
    }
  }

  return [{ sectionIndex: heroSection.index, entries }]
}

export async function detectTypingEffect(page: Page): Promise<AnimationEntry | null> {
  const heroHeading = await page.$("h1, [class*='tagline']")
  if (!heroHeading) return null

  const snapshots: { text: string; time: number }[] = []
  for (let i = 0; i < 25; i++) {
    const text = await heroHeading.evaluate(el => el.textContent?.trim() || "")
    snapshots.push({ text, time: Date.now() })
    await page.waitForTimeout(200)
  }

  const uniqueLengths = new Set(snapshots.map(s => s.text.length))
  if (uniqueLengths.size > 5) {
    const finalText = snapshots[snapshots.length - 1].text
    const totalDuration = snapshots[snapshots.length - 1].time - snapshots[0].time
    const charsPerSecond = finalText.length / (totalDuration / 1000)
    return {
      trigger: "page-load",
      target: selectorFor("h1", "", finalText.slice(0, 30)),
      from: { textContent: "" },
      to: { textContent: finalText },
      type: "typing",
      estimatedDuration: totalDuration,
      details: { charsPerSecond: Math.round(charsPerSecond), finalText },
    }
  }
  return null
}

export async function observeMarquee(page: Page, sectionHandle: ElementHandle): Promise<AnimationEntry | null> {
  const candidates = await sectionHandle.$$("[class*='logo'], [class*='marquee']")
  for (const candidate of candidates) {
    const t1 = await candidate.evaluate(el => {
      const cs = window.getComputedStyle(el)
      return { transform: cs.transform, time: Date.now() }
    })
    await page.waitForTimeout(1000)
    const t2 = await candidate.evaluate(el => {
      const cs = window.getComputedStyle(el)
      return { transform: cs.transform, time: Date.now() }
    })

    if (t1.transform !== t2.transform && t1.transform !== "none") {
      const parseX = (t: string) => {
        const match = t.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,\s*([-\d.]+)/)
        return match ? parseFloat(match[1]) : 0
      }
      const x1 = parseX(t1.transform)
      const x2 = parseX(t2.transform)
      const pxPerSecond = Math.abs(x2 - x1)
      const className = await candidate.evaluate(el => el.className?.toString?.() || "")

      return {
        trigger: "continuous" as const,
        target: selectorFor("div", className, ""),
        from: { transform: "translateX(0)" },
        to: { transform: "translateX(-50%)" },
        type: "marquee",
        details: { pxPerSecond: Math.round(pxPerSecond), direction: x2 < x1 ? "left" : "right" },
      }
    }
  }
  return null
}

export async function extractTransitionTiming(sectionHandle: ElementHandle): Promise<{ selector: string; duration: string; easing: string }[]> {
  return sectionHandle.evaluate((node) => {
    const section = node as Element
    const results: { selector: string; duration: string; easing: string }[] = []
    const interactive = Array.from(section.querySelectorAll("a, button"))
    for (const el of interactive) {
      const cs = window.getComputedStyle(el)
      const duration = cs.transitionDuration
      const easing = cs.transitionTimingFunction
      if (duration && duration !== "0s") {
        const cls = (el.className?.toString?.() || "").split(" ").filter((c: string) => c && !c.startsWith("w-")).slice(0, 2).join(".")
        results.push({
          selector: cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase(),
          duration,
          easing,
        })
      }
    }
    return results
  })
}

export async function detectDynamicElements(page: Page, adapter: MergedAdapter | null): Promise<Omit<DynamicMaskEntry, "sectionIndex">[]> {
  const detected = await page.evaluate(() => {
    const results: { selector: string; reason: string; boundingBox: { x: number; y: number; width: number; height: number } }[] = []

    function buildSelector(el: Element): string {
      if (el.id) return `#${el.id}`
      const tag = el.tagName.toLowerCase()
      const classes = Array.from(el.classList).slice(0, 3)
      return classes.length ? `${tag}.${classes.join(".")}` : tag
    }

    function addResult(el: Element, reason: string) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) return
      results.push({
        selector: buildSelector(el),
        reason,
        boundingBox: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      })
    }

    // Autoplay media
    document.querySelectorAll("video[autoplay], audio[autoplay]").forEach(el => addResult(el, "autoplay media"))

    // Infinite CSS animations
    document.querySelectorAll("*").forEach(el => {
      const cs = window.getComputedStyle(el)
      if (cs.animationIterationCount === "infinite" && cs.animationName !== "none") {
        addResult(el, "infinite CSS animation")
      }
    })

    // Animated GIFs
    document.querySelectorAll('img[src$=".gif"], img[src*=".gif?"]').forEach(el => addResult(el, "animated GIF"))

    // GSAP infinite timelines
    document.querySelectorAll("[data-logo-wall-cycle-init], [data-marquee], [data-ticker], [data-scroll-animation='infinite']")
      .forEach(el => addResult(el, "GSAP infinite timeline"))

    // Swiper autoplay
    document.querySelectorAll(".swiper[data-autoplay], .swiper-container[data-autoplay]")
      .forEach(el => addResult(el, "swiper autoplay"))

    return results
  }).catch((): { selector: string; reason: string; boundingBox: { x: number; y: number; width: number; height: number } }[] => [])

  // Merge adapter-declared dynamic elements
  const adapterElements = adapter?.dynamicElements ?? []
  for (const decl of adapterElements) {
    const els = await page.evaluate((sel) => {
      const matches = document.querySelectorAll(sel)
      return Array.from(matches).map(el => {
        const rect = el.getBoundingClientRect()
        return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
      })
    }, decl.selector).catch(() => [])

    for (const box of els) {
      if (box.width === 0 && box.height === 0) continue
      detected.push({ selector: decl.selector, reason: decl.reason, boundingBox: box })
    }
  }

  // Deduplicate by selector
  const seen = new Set<string>()
  return detected.filter(d => {
    if (seen.has(d.selector)) return false
    seen.add(d.selector)
    return true
  })
}

function assignSectionIndices(
  dynamicElements: Omit<DynamicMaskEntry, "sectionIndex">[],
  sectionBoxes: { index: number; y: number; height: number }[],
): DynamicMaskEntry[] {
  return dynamicElements.map(el => {
    const elTop = el.boundingBox.y
    const elBottom = elTop + el.boundingBox.height
    let bestSection = 0
    let bestOverlap = 0

    for (const sec of sectionBoxes) {
      const secTop = sec.y
      const secBottom = secTop + sec.height
      const overlapTop = Math.max(elTop, secTop)
      const overlapBottom = Math.min(elBottom, secBottom)
      const overlap = Math.max(0, overlapBottom - overlapTop)
      if (overlap > bestOverlap) {
        bestOverlap = overlap
        bestSection = sec.index
      }
    }

    return { ...el, sectionIndex: bestSection }
  })
}

export async function extractAnimationsFromPage(
  page: Page,
  adapter: MergedAdapter | null,
  opts?: { skipPageLoad?: boolean; url?: string }
): Promise<AnimationExtractionResult> {
  let pageLoadAnimations: AnimationEntry[] | "unavailable-flow-mode" = "unavailable-flow-mode"
  let pageLoadResults: { sectionIndex: number; entries: AnimationEntry[] }[] = []
  let typingResult: AnimationEntry | null = null

  if (!opts?.skipPageLoad && opts?.url) {
    console.log("\nPass 2: Page-load animations...")
    pageLoadResults = await observePageLoadAnimations(page, opts.url, adapter)
    console.log(`  Found ${pageLoadResults.reduce((sum, r) => sum + r.entries.length, 0)} page-load entries`)

    console.log("\nDetecting typing effect...")
    typingResult = await detectTypingEffect(page)
    console.log(`  Typing effect: ${typingResult ? "detected" : "not found"}`)

    pageLoadAnimations = pageLoadResults.flatMap(r => r.entries)
    if (typingResult) (pageLoadAnimations as AnimationEntry[]).push(typingResult)

    await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: 30000 })
    await dismissCookieBanner(page)
    await page.waitForTimeout(1000)
  }

  const sections = await getSectionHandles(page, adapter)
  console.log(`\nFound ${sections.length} sections\n`)

  const sectionResults: SectionAnimations[] = []

  for (const section of sections) {
    const allEntries: AnimationEntry[] = []

    const plr = pageLoadResults.find(r => r.sectionIndex === section.index)
    if (plr) allEntries.push(...plr.entries)
    if (typingResult && section.index <= 2) allEntries.push(typingResult)

    const entranceEntries = await observeEntranceAnimations(page, section.handle)
    allEntries.push(...entranceEntries)

    const marqueeEntry = await observeMarquee(page, section.handle)
    if (marqueeEntry) allEntries.push(marqueeEntry)

    const timings = await extractTransitionTiming(section.handle)

    const paddedIndex = String(section.index + 1).padStart(2, "0")
    console.log(`  [${paddedIndex}] ${section.label}: ${allEntries.length} animations, ${timings.length} transition timings`)

    sectionResults.push({
      index: section.index,
      label: section.label,
      animations: allEntries,
      transitionTimings: timings,
    })
  }

  // Dynamic element detection (runs once at current viewport)
  console.log("\nDetecting dynamic elements...")
  const rawDynamic = await detectDynamicElements(page, adapter)

  const sectionBoxes = await Promise.all(
    sections.map(async (s) => {
      const box = await s.handle.evaluate((el) => {
        const rect = (el as Element).getBoundingClientRect()
        return { y: Math.round(rect.y), height: Math.round(rect.height) }
      }).catch(() => ({ y: 0, height: 0 }))
      return { index: s.index, ...box }
    })
  )

  const dynamicMasks = assignSectionIndices(rawDynamic, sectionBoxes)
  console.log(`  Found ${dynamicMasks.length} dynamic elements`)

  const viewport = page.viewportSize() ?? { width: 1440, height: 900 }
  const dynamicMasksOutput: DynamicMasksOutput = {
    version: 1,
    viewport: { width: viewport.width, height: viewport.height },
    masks: dynamicMasks,
  }

  return { sections: sectionResults, pageLoadAnimations, dynamicMasks: dynamicMasksOutput }
}

export function writeAnimationOutput(result: AnimationExtractionResult, outputDir: string) {
  mkdirSync(outputDir, { recursive: true })
  for (const section of result.sections) {
    const paddedIndex = String(section.index + 1).padStart(2, "0")
    const fileName = `${paddedIndex}-${section.label}.animations.json`
    const output = { animations: section.animations, transitionTimings: section.transitionTimings }
    writeFileSync(join(outputDir, fileName), JSON.stringify(output, null, 2))
  }

  if (result.dynamicMasks) {
    writeFileSync(join(outputDir, "dynamic-masks.json"), JSON.stringify(result.dynamicMasks, null, 2))
  }
}
