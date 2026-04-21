import type { Page, ElementHandle } from "@playwright/test"
import type { AdapterSectionDiscovery } from "./adapter-loader.ts"
import { getAllCookieSkipSelectors } from "./cookie-consent.ts"

export interface SectionDiscoveryMeta {
  unwrapApplied: boolean
  reason?: string
  originalSections?: number
  finalSections?: number
  unwrappedSection?: {
    tag: string
    className: string
    height: number
    heightPercent: number
    childCount: number
  }
}

export interface DiscoveryResult {
  handles: ElementHandle[]
  meta: SectionDiscoveryMeta
}

const SKIP_TAGS = new Set(["script", "noscript", "style", "link", "dialog"])

function detectSpaContainer(): string | null {
  const skipTags = ["SCRIPT", "NOSCRIPT", "STYLE", "LINK", "DIALOG"]
  let best: Element | null = null
  let bestHeight = 0
  function walk(el: Element, depth: number) {
    if (depth > 5) return
    for (let i = 0; i < el.children.length; i++) {
      const child = el.children[i]
      if (skipTags.indexOf(child.tagName) >= 0) continue
      const h = child.getBoundingClientRect().height
      let visibleKids = 0
      for (let j = 0; j < child.children.length; j++) {
        const c = child.children[j]
        if (c.getBoundingClientRect().height > 10 && skipTags.indexOf(c.tagName) < 0) visibleKids++
      }
      if (h > bestHeight && visibleKids >= 2) {
        best = child
        bestHeight = h
      }
      walk(child, depth + 1)
    }
  }
  walk(document.body, 0)
  if (!best) return null
  const found: Element = best
  const id = found.id
  if (id) return "#" + id + " > *"
  const path: string[] = []
  let current: Element | null = found
  while (current && current !== document.body) {
    const parent: Element | null = current.parentElement
    if (!parent) break
    const idx = Array.prototype.indexOf.call(parent.children, current) + 1
    path.unshift(":nth-child(" + idx + ")")
    current = parent
  }
  return "body > " + path.join(" > ") + " > *"
}

async function tryUnwrapMegaSection(
  page: Page,
  handles: ElementHandle[],
  skipSet: Set<string>,
  quiet?: boolean
): Promise<DiscoveryResult> {
  if (handles.length < 2) {
    return { handles, meta: { unwrapApplied: false } }
  }

  const sectionInfo = await Promise.all(
    handles.map(async (h) =>
      h.evaluate((node) => {
        const el = node as Element
        return {
          tag: el.tagName.toLowerCase(),
          className: (el.className as unknown as string)?.toString?.() || "",
          height: el.getBoundingClientRect().height,
          y: el.getBoundingClientRect().y,
        }
      })
    )
  )

  const totalHeight = sectionInfo.reduce((sum, s) => sum + s.height, 0)
  if (totalHeight === 0) {
    return { handles, meta: { unwrapApplied: false } }
  }

  const sorted = sectionInfo
    .map((info, i) => ({ ...info, index: i }))
    .sort((a, b) => a.y - b.y)

  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const middle = sorted.slice(1, -1)

  if (middle.length !== 1) {
    return { handles, meta: { unwrapApplied: false } }
  }

  const mega = middle[0]
  const megaHandle = handles[mega.index]

  const megaChildren = await megaHandle.$$(':scope > *')
  const visibleChildren: ElementHandle[] = []
  for (const child of megaChildren) {
    const info = await child.evaluate((node) => {
      const el = node as Element
      return {
        tag: el.tagName.toLowerCase(),
        height: el.getBoundingClientRect().height,
      }
    })
    if (info.height > 10 && !skipSet.has(info.tag)) {
      visibleChildren.push(child)
    }
  }

  if (visibleChildren.length < 2) {
    return { handles, meta: { unwrapApplied: false } }
  }

  // Safety net: check if children are visually coupled via absolute positioning
  const childPositions = await Promise.all(
    visibleChildren.map(async (child) =>
      child.evaluate((node) => {
        const el = node as Element
        const cs = getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        return {
          position: cs.position,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        }
      })
    )
  )

  // If any child is position:absolute and overlaps >80% of a sibling's area, abort
  for (let i = 0; i < childPositions.length; i++) {
    if (childPositions[i].position !== "absolute") continue
    const abs = childPositions[i]
    for (let j = 0; j < childPositions.length; j++) {
      if (i === j) continue
      const sib = childPositions[j]
      const overlapX = Math.max(0, Math.min(abs.x + abs.width, sib.x + sib.width) - Math.max(abs.x, sib.x))
      const overlapY = Math.max(0, Math.min(abs.y + abs.height, sib.y + sib.height) - Math.max(abs.y, sib.y))
      const overlapArea = overlapX * overlapY
      const sibArea = sib.width * sib.height
      if (sibArea > 0 && overlapArea / sibArea > 0.8) {
        if (!quiet) {
          console.log(`  Unwrap aborted: child ${i} (position:absolute) overlaps ${Math.round(overlapArea / sibArea * 100)}% of sibling ${j}`)
        }
        return { handles, meta: { unwrapApplied: false, reason: `Aborted: absolutely positioned child overlaps sibling (visually coupled layers)` } }
      }
    }
  }

  const heightPercent = Math.round((mega.height / totalHeight) * 100)
  const reason = `Section '${mega.className.split(" ")[0] || mega.tag}' (${Math.round(mega.height)}px, ${heightPercent}% of page) was the only content section between ${first.tag} (${Math.round(first.height)}px) and ${last.tag} (${Math.round(last.height)}px). Unwrapped into ${visibleChildren.length} child sections.`

  if (!quiet) {
    console.log(`  Unwrapping mega-section: ${reason}`)
  }

  const navHandle = handles[first.index]
  const footerHandle = handles[last.index]
  const newHandles = [navHandle, ...visibleChildren, footerHandle]

  return {
    handles: newHandles,
    meta: {
      unwrapApplied: true,
      reason,
      originalSections: handles.length,
      finalSections: newHandles.length,
      unwrappedSection: {
        tag: mega.tag,
        className: mega.className,
        height: mega.height,
        heightPercent,
        childCount: visibleChildren.length,
      },
    },
  }
}

async function recursiveExpandSections(
  page: Page,
  handles: ElementHandle[],
  skipSet: Set<string>,
  depth: number,
  maxDepth: number,
  quiet?: boolean
): Promise<ElementHandle[]> {
  if (depth >= maxDepth) return handles

  const result: ElementHandle[] = []

  // Get parent height for proportional checks
  const parentHeights = await Promise.all(
    handles.map(h => h.evaluate(node => {
      const el = node as Element
      const rect = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return {
        height: rect.height > 10 ? rect.height :
          (cs.position === "absolute" || cs.position === "fixed") && el.scrollHeight > 10 ? el.scrollHeight : 0,
      }
    }))
  )
  const totalParentHeight = parentHeights.reduce((sum, p) => sum + p.height, 0)
  if (totalParentHeight === 0) return handles

  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i]
    const info = await handle.evaluate((node, totalH) => {
      const el = node as Element
      const SKIP = ["SCRIPT", "NOSCRIPT", "STYLE", "LINK", "DIALOG"]
      const rect = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const height = rect.height > 10 ? rect.height :
        (cs.position === "absolute" || cs.position === "fixed") && el.scrollHeight > 10 ? el.scrollHeight : 0

      // Count visible children
      let visibleChildren = 0
      for (let j = 0; j < el.children.length; j++) {
        const child = el.children[j]
        if (SKIP.includes(child.tagName)) continue
        const cr = child.getBoundingClientRect()
        const ccs = getComputedStyle(child)
        const ch = cr.height > 10 ? cr.height :
          (ccs.position === "absolute" || ccs.position === "fixed") && child.scrollHeight > 10 ? child.scrollHeight : 0
        if (ch > 10) visibleChildren++
      }

      const isWrapper = totalH > 0 && Math.abs(height - totalH) / totalH < 0.05
      const isMega = height > totalH * 0.25 && visibleChildren >= 2

      return { height, isWrapper, isMega, visibleChildren }
    }, totalParentHeight)

    if (info.isWrapper) {
      // Transparent wrapper — descend unconditionally
      if (!quiet) console.log(`  ${"  ".repeat(depth)}Wrapper (${info.height}px ≈ parent) — descending`)
      const children = await getVisibleChildren(page, handle, skipSet)
      const expanded = await recursiveExpandSections(page, children, skipSet, depth + 1, maxDepth, quiet)
      result.push(...expanded)
    } else if (info.isMega) {
      // Mega-section — expand into children
      if (!quiet) console.log(`  ${"  ".repeat(depth)}Mega-section (${info.height}px, ${info.visibleChildren} children) — expanding`)
      const children = await getVisibleChildren(page, handle, skipSet)
      const expanded = await recursiveExpandSections(page, children, skipSet, depth + 1, maxDepth, quiet)
      result.push(...(expanded.length > 0 ? expanded : [handle]))
    } else {
      result.push(handle)
    }
  }

  return result
}

async function getVisibleChildren(
  page: Page,
  parentHandle: ElementHandle,
  skipSet: Set<string>
): Promise<ElementHandle[]> {
  const children = await parentHandle.$$(':scope > *')
  const result: ElementHandle[] = []
  for (const child of children) {
    const info = await child.evaluate((node) => {
      const el = node as Element
      const rect = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return {
        tag: el.tagName.toLowerCase(),
        height: rect.height,
        scrollHeight: el.scrollHeight,
        position: cs.position,
      }
    })
    if (skipSet.has(info.tag)) continue
    const visible = info.height > 10 || ((info.position === "absolute" || info.position === "fixed") && info.scrollHeight > 10)
    if (visible) result.push(child)
  }
  return result
}

/**
 * Find visible top-level sections on a page.
 * Falls back to SPA container detection when body > * yields fewer than 3 sections.
 * Applies proportional unwrapping when a single mega-section dominates the page.
 *
 * When an adapter is provided, uses adapter.primarySelector and spaContainerHints
 * instead of hardcoded defaults.
 */
export async function discoverSections(
  page: Page,
  opts?: { customSelector?: string; quiet?: boolean; adapter?: AdapterSectionDiscovery }
): Promise<DiscoveryResult> {
  const adapterSelector = opts?.adapter?.primarySelector
  const selector = opts?.customSelector || adapterSelector || "body > *"
  const skipSet = opts?.adapter?.skipSelectors
    ? new Set(opts.adapter.skipSelectors)
    : SKIP_TAGS

  let handles = await filterVisible(page, selector, skipSet)

  const minSections = opts?.adapter?.minExpectedSections ?? 3
  if (!opts?.customSelector && handles.length < minSections) {
    // Try adapter SPA container hints first (with ceiling check)
    const hints = opts?.adapter?.spaContainerHints ?? []
    const maxAcceptable = minSections * 3
    for (const hint of hints) {
      if (!opts?.quiet) console.log(`  Trying SPA hint: ${hint}`)
      const hintHandles = await filterVisible(page, hint, skipSet)
      if (hintHandles.length >= minSections && hintHandles.length <= maxAcceptable) {
        if (!opts?.quiet) console.log(`  SPA hint matched: ${hint} (${hintHandles.length} sections)`)
        return { handles: hintHandles, meta: { unwrapApplied: false } }
      }
      if (hintHandles.length > maxAcceptable && !opts?.quiet) {
        console.log(`  SPA hint rejected: ${hint} returned ${hintHandles.length} (max ${maxAcceptable}) — over-segmented`)
      }
    }

    // Fall back to generic SPA container detection + recursive expansion
    if (!opts?.quiet) console.log(`  Only ${handles.length} body-level sections — detecting SPA container...`)
    const deepSelector: string | null = await page.evaluate(detectSpaContainer)

    if (deepSelector) {
      if (!opts?.quiet) console.log(`  Using SPA selector: ${deepSelector}`)
      handles = await filterVisible(page, deepSelector, skipSet)
      // Recursively expand mega-sections and skip transparent wrappers
      handles = await recursiveExpandSections(page, handles, skipSet, 0, 3, opts?.quiet)
    }
  }

  // Proportional unwrapping: if exactly 1 content section between nav/footer, unwrap it
  if (!opts?.customSelector && !opts?.adapter?.disableUnwrap) {
    return tryUnwrapMegaSection(page, handles, skipSet, opts?.quiet)
  }

  return { handles, meta: { unwrapApplied: false } }
}

async function filterVisible(
  page: Page,
  selector: string,
  skipSet: Set<string> = SKIP_TAGS
): Promise<ElementHandle[]> {
  const cookieSelectors = getAllCookieSkipSelectors()
  const all = await page.$$(selector)
  const result: ElementHandle[] = []
  for (const h of all) {
    const info = await h.evaluate((el, csSelectors) => {
      const isCookieBanner = csSelectors.some((s) => {
        try { return el.matches(s) } catch { return false }
      })
      const cs = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return {
        tag: el.tagName.toLowerCase(),
        height: rect.height,
        scrollHeight: el.scrollHeight,
        position: cs.position,
        isCookieBanner,
      }
    }, cookieSelectors)
    if (skipSet.has(info.tag) || info.isCookieBanner) continue
    // Keep elements that are visible by layout height, or absolute/fixed elements
    // that have scrollable content (Framer uses position:absolute with 0 layout height)
    const visible = info.height > 10 || ((info.position === "absolute" || info.position === "fixed") && info.scrollHeight > 10)
    if (visible) result.push(h)
  }
  return result
}
