import type { Page, ElementHandle } from "@playwright/test"
import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { discoverSections, type SectionDiscoveryMeta } from "./section-discovery.ts"
import { createMapper } from "./tailwind-mapper.ts"
import type { MergedAdapter, WrapperMapping } from "./adapter-loader.ts"
import { deriveClassHint, deriveSemanticRole, type SemanticRole } from "./structure-snapshot.ts"

// --- Types ---

export interface ElementSpec {
  tag: string
  className: string
  text: string
  role: string | null
  attrs: Record<string, string>
  bounds: { x: number; y: number; width: number; height: number }
  styles: Record<string, string>
  pseudoElements?: {
    before?: Record<string, string>
    after?: Record<string, string>
  }
  animations: {
    hover?: Record<string, { from: string; to: string }>
  }
  children: ElementSpec[]
}

export interface SectionSpec {
  index: number
  label: string
  sectionClassName: string
  bounds: { x: number; y: number; width: number; height: number }
  elements: ElementSpec
}

export interface StyleEntry {
  selector: string
  text: string
  classes: string
  rawStyles: Record<string, string>
  pseudoElements?: {
    before?: Record<string, string>
    after?: Record<string, string>
  }
  hover?: Record<string, { from: string; to: string }>
  hoverClasses?: string
  verify?: string
}

export interface FlatElement {
  selector: string
  text: string
  rawStyles: Record<string, string>
  pseudoElements?: {
    before?: Record<string, string>
    after?: Record<string, string>
  }
  hover?: Record<string, { from: string; to: string }>
  tag: string
  className: string
  bounds: { x: number; y: number; width: number; height: number }
}

export interface GlobalFoundation {
  body: Record<string, string>
  container: Record<string, string>
  sectionPadding: Record<string, { top: string; bottom: string }>
  spacers: Record<string, string>
  resets: Record<string, string>
}

export interface ViewportSectionData {
  label: string
  index: number
  tag: string
  classHint: string
  firstHeading: string
  textPreview: string
  semanticRole: SemanticRole
  hasVideo: boolean
  hasBackgroundImage: boolean
  hasInteractiveLinks: boolean
  bounds: { x: number; y: number; width: number; height: number }
  elementTree: ElementSpec | null
  flatElements: Map<string, FlatElement>
  viewportStyles: Map<string, Record<string, string>>
}

export interface StyleExtractionSectionOutput {
  index: number
  label: string
  tag: string
  classHint: string
  firstHeading: string
  textPreview: string
  semanticRole: SemanticRole
  hasVideo: boolean
  hasBackgroundImage: boolean
  hasInteractiveLinks: boolean
  bounds: { x: number; y: number; width: number; height: number }
  structureTree: string
  styleEntries: StyleEntry[]
}

export interface ViewportExtractionResult {
  viewport: number
  sections: ViewportSectionData[]
  globals?: GlobalFoundation
  discoveryMeta?: SectionDiscoveryMeta
}

export interface StyleExtractionOutput {
  url: string
  viewports: number[]
  format: string
  extractionMethod: string
  globals: GlobalFoundation | null
  sectionDiscoveryMeta?: SectionDiscoveryMeta
  viewportStructures?: Record<string, string>
  sections: StyleExtractionSectionOutput[]
}

const GENERIC_SECTION_HINTS = new Set(["section", "overflow-hidden", "wrapper", "container", "component", "div"])

function getSectionKey(section: Pick<ViewportSectionData, "index" | "label">): string {
  return `${section.index}:${section.label}`
}

export function resolveSectionClassHint(classHint: string, label: string): string {
  return GENERIC_SECTION_HINTS.has(classHint.toLowerCase()) ? label : classHint
}

// --- Constants ---

export const STYLE_PROPERTIES = [
  "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing",
  "textTransform", "textAlign", "textDecoration", "fontStyle",
  "color", "backgroundColor", "borderColor",
  "marginTop", "marginRight", "marginBottom", "marginLeft",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "width", "height", "maxWidth", "maxHeight", "minWidth", "minHeight",
  "display", "flexDirection", "justifyContent", "alignItems", "alignSelf",
  "flexWrap", "flexGrow", "flexShrink", "gap", "rowGap", "columnGap",
  "gridTemplateColumns", "gridTemplateRows", "gridColumn", "gridRow",
  "borderWidth", "borderStyle", "borderRadius",
  "borderTopLeftRadius", "borderTopRightRadius",
  "borderBottomLeftRadius", "borderBottomRightRadius",
  "position", "top", "right", "bottom", "left", "zIndex",
  "opacity", "boxShadow", "transform", "overflow", "overflowX", "overflowY",
  "backgroundImage", "backgroundSize", "backgroundPosition", "backgroundRepeat",
]

const DEFAULT_VALUES = new Set([
  "0px", "none", "normal", "auto", "rgba(0, 0, 0, 0)", "start",
  "visible", "nowrap", "row", "0", "1", "static", "baseline",
  "stretch", "content-box", "border-box", "repeat", "scroll",
  "transparent", "currentcolor", "medium", "disc", "outside",
  "0% 0%",
])

const INHERITED = new Set([
  "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing",
  "textTransform", "textAlign", "fontStyle", "color", "textDecoration",
])

const MAX_DEPTH = 20
const ATTR_NAMES = ["src", "alt", "href", "type", "placeholder", "action", "method"]

// --- Helpers ---

export function filterStyles(
  styles: Record<string, string>,
  parentStyles?: Record<string, string>
): Record<string, string> {
  const filtered: Record<string, string> = {}
  for (const [key, val] of Object.entries(styles)) {
    if (DEFAULT_VALUES.has(val)) continue
    if (parentStyles && INHERITED.has(key) && parentStyles[key] === val) continue
    filtered[key] = val
  }
  return filtered
}

export function stableElementId(el: { tag: string; className: string; text: string }): string {
  const firstClass = el.className.split(" ").filter(c => c && !c.startsWith("w-")).slice(0, 2).join(".")
  const textKey = el.text.slice(0, 20).toLowerCase().replace(/[^a-z0-9]+/g, "-")
  return `${el.tag}.${firstClass}.${textKey}`
}

export function getVisibilityClass(appearsAt: number): string {
  if (appearsAt <= 640) return ""
  if (appearsAt <= 768) return "hidden md:block"
  if (appearsAt <= 1024) return "hidden lg:block"
  return "hidden xl:block"
}

export function renderStructureTree(el: ElementSpec, indent = 0): string {
  const pad = "  ".repeat(indent)
  const cls = el.className.split(" ").filter(c => c && !c.startsWith("w-")).slice(0, 3).join(".")
  const label = cls ? `${el.tag}.${cls}` : el.tag

  const parts = [`${pad}- ${label}`]

  if (el.attrs.src) parts.push(`[src="${el.attrs.src}"]`)
  if (el.attrs.alt) parts.push(`[alt="${el.attrs.alt}"]`)
  if (el.attrs.href) parts.push(`[href="${el.attrs.href}"]`)
  if (el.attrs.type) parts.push(`[type="${el.attrs.type}"]`)
  if (el.attrs.placeholder) parts.push(`[placeholder="${el.attrs.placeholder}"]`)

  const text = el.text.slice(0, 50)
  if (text) parts.push(`"${text}"`)

  if (el.tag === "img") {
    parts.push(`(${Math.round(el.bounds.width)}x${Math.round(el.bounds.height)})`)
  }

  let line = parts.join(" ") + "\n"
  for (const child of el.children) {
    line += renderStructureTree(child, indent + 1)
  }
  return line
}

export function mapWrapperClasses(
  className: string,
  styles: Record<string, string>,
  adapter: MergedAdapter | null
): string | null {
  const mappings: WrapperMapping[] = adapter?.styles?.wrapperMappings ?? [
    { classPattern: "padding-global", tailwindClasses: "px-[5%]" },
    { classPattern: "container-large", tailwindClasses: "max-w-[1280px] mx-auto w-full" },
    { classPattern: "container-small", tailwindClasses: "max-w-[768px] mx-auto w-full" },
    { classPattern: "padding-section-large", tailwindClasses: "py-[112px]" },
    { classPattern: "padding-section-medium", tailwindClasses: "py-[80px]" },
  ]
  for (const m of mappings) {
    if (className.includes(m.classPattern)) return m.tailwindClasses
  }
  if (className.includes("spacer-")) {
    const pt = styles.paddingTop
    if (pt) return `h-[${pt}]`
  }
  return null
}

export function flattenStyles(
  el: ElementSpec,
  mapper: ReturnType<typeof createMapper>,
  adapter: MergedAdapter | null,
  parentStyles?: Record<string, string>
): StyleEntry[] {
  const filtered = filterStyles(el.styles, parentStyles)
  const entries: StyleEntry[] = []

  if (Object.keys(filtered).length > 0) {
    const cls = el.className.split(" ").filter(c => c && !c.startsWith("w-")).slice(0, 2).join(".")
    const selector = cls ? `${el.tag}.${cls}` : el.tag
    const wrapperClasses = mapWrapperClasses(el.className, el.styles, adapter)
    const classString = wrapperClasses ?? mapper.mapStyles(filtered)
    const cleanedClasses = wrapperClasses ? classString : mapper.cleanClasses(classString, { tag: el.tag, className: el.className, bounds: el.bounds })
    const entry: StyleEntry = {
      selector,
      text: el.text.slice(0, 50),
      classes: cleanedClasses,
      rawStyles: filtered,
      pseudoElements: el.pseudoElements,
    }

    if (el.animations.hover && Object.keys(el.animations.hover).length > 0) {
      entry.hover = el.animations.hover
      const hoverStyles: Record<string, string> = {}
      for (const [key, { to }] of Object.entries(el.animations.hover)) {
        hoverStyles[key] = to
      }
      entry.hoverClasses = mapper.mapStyles(hoverStyles)
    }

    if (["h1", "h2", "h3", "h4"].includes(el.tag)) {
      entry.verify = `${el.text.slice(0, 30)} must be ${filtered.fontSize || "?"} ${filtered.fontWeight || "?"} ${filtered.fontFamily?.split(",")[0] || "?"}`
    }
    if (el.className.includes("tagline") || el.className.includes("button")) {
      entry.verify = `${el.text.slice(0, 30)} must be ${filtered.fontSize || "?"} ${filtered.fontWeight || "?"} ${filtered.textTransform || ""}`
    }

    entries.push(entry)
  }

  for (const child of el.children) {
    entries.push(...flattenStyles(child, mapper, adapter, el.styles))
  }

  return entries
}

export function flattenElementsById(
  el: ElementSpec,
  parentStyles?: Record<string, string>
): Map<string, FlatElement> {
  const result = new Map<string, FlatElement>()
  const filtered = filterStyles(el.styles, parentStyles)

  if (Object.keys(filtered).length > 0) {
    const id = stableElementId(el)
    const cls = el.className.split(" ").filter(c => c && !c.startsWith("w-")).slice(0, 2).join(".")
    const selector = cls ? `${el.tag}.${cls}` : el.tag
    if (!result.has(id)) {
      result.set(id, {
        selector,
        text: el.text.slice(0, 50),
        rawStyles: filtered,
        pseudoElements: el.pseudoElements,
        hover: (el.animations.hover && Object.keys(el.animations.hover).length > 0) ? el.animations.hover : undefined,
        tag: el.tag,
        className: el.className,
        bounds: el.bounds,
      })
    }
  }

  for (const child of el.children) {
    const childResult = flattenElementsById(child, el.styles)
    for (const [id, data] of Array.from(childResult)) {
      if (!result.has(id)) result.set(id, data)
    }
  }

  return result
}

// --- Element extraction ---

export async function extractElement(
  page: Page,
  handle: ElementHandle,
  depth: number
): Promise<ElementSpec | null> {
  if (depth > MAX_DEPTH) return null

  const data = await handle.evaluate((node, { props, attrNames }) => {
    const el = node as Element
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return null
    const cs = window.getComputedStyle(el)
    const styles: Record<string, string> = {}
    for (const p of props) {
      styles[p] = cs.getPropertyValue(
        p.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
      )
    }
    const attrs: Record<string, string> = {}
    for (const name of attrNames) {
      const val = el.getAttribute(name)
      if (val) attrs[name] = val
    }
    const bgImage = cs.getPropertyValue("background-image")
    if (bgImage && bgImage !== "none") attrs["backgroundImage"] = bgImage

    const pseudoProps = [
      "backgroundImage", "backgroundColor", "width", "height",
      "position", "opacity", "borderRadius",
      "top", "left", "right", "bottom", "content",
    ]
    let pseudoBefore: Record<string, string> | undefined
    let pseudoAfter: Record<string, string> | undefined

    const beforeCs = window.getComputedStyle(el, "::before")
    const beforeContent = beforeCs.getPropertyValue("content")
    if (beforeContent && beforeContent !== "none") {
      pseudoBefore = {}
      for (const p of pseudoProps) {
        const cssName = p.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
        pseudoBefore[p] = beforeCs.getPropertyValue(cssName)
      }
    }

    const afterCs = window.getComputedStyle(el, "::after")
    const afterContent = afterCs.getPropertyValue("content")
    if (afterContent && afterContent !== "none") {
      pseudoAfter = {}
      for (const p of pseudoProps) {
        const cssName = p.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
        pseudoAfter[p] = afterCs.getPropertyValue(cssName)
      }
    }

    return {
      tag: el.tagName.toLowerCase(),
      className: (el.className as unknown as string)?.toString?.() || "",
      text: el.textContent?.trim().slice(0, 80) || "",
      role: el.getAttribute("role"),
      attrs,
      bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      styles,
      pseudoBefore,
      pseudoAfter,
    }
  }, { props: STYLE_PROPERTIES, attrNames: ATTR_NAMES })

  if (!data) return null

  const children: ElementSpec[] = []
  const childHandles = await handle.$$(":scope > *")
  for (const child of childHandles) {
    const childSpec = await extractElement(page, child, depth + 1)
    if (childSpec) children.push(childSpec)
  }

  const { pseudoBefore, pseudoAfter, ...rest } = data

  const pseudoElements =
    (pseudoBefore || pseudoAfter)
      ? {
          ...(pseudoBefore ? { before: pseudoBefore } : {}),
          ...(pseudoAfter ? { after: pseudoAfter } : {}),
        }
      : undefined

  return { ...rest, pseudoElements, animations: {}, children }
}

export async function extractHoverStates(
  page: Page,
  handle: ElementHandle,
  spec: ElementSpec
) {
  const interactive = ["a", "button"]
  if (!interactive.includes(spec.tag)) {
    for (let i = 0; i < spec.children.length; i++) {
      const childHandle = (await handle.$$(":scope > *"))[i]
      if (childHandle && spec.children[i]) {
        await extractHoverStates(page, childHandle, spec.children[i])
      }
    }
    return
  }

  const beforeStyles = { ...spec.styles }
  await handle.hover({ timeout: 1000 }).catch(() => {})
  await page.waitForTimeout(350)

  const afterStyles = await handle.evaluate((node, props) => {
    const el = node as Element
    const cs = window.getComputedStyle(el)
    const styles: Record<string, string> = {}
    for (const p of props) {
      styles[p] = cs.getPropertyValue(
        p.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
      )
    }
    return styles
  }, STYLE_PROPERTIES)

  const hover: Record<string, { from: string; to: string }> = {}
  for (const [key, val] of Object.entries(afterStyles)) {
    if (val !== beforeStyles[key]) {
      hover[key] = { from: beforeStyles[key], to: val }
    }
  }

  if (Object.keys(hover).length > 0) {
    spec.animations.hover = hover
  }

  await page.mouse.move(0, 0)
  await page.waitForTimeout(200)
}

export async function extractGlobalFoundation(
  page: Page,
  adapter: MergedAdapter | null
): Promise<GlobalFoundation> {
  const selectors = adapter?.styles?.globalSelectors
  const paddingGlobalSel = selectors?.paddingGlobal ?? ".padding-global"
  const containerLargeSel = selectors?.containerMax ?? ".container-large"
  const sectionPaddingLargeSel = selectors?.sectionPaddingLarge ?? ".padding-section-large"
  const sectionPaddingMediumSel = selectors?.sectionPaddingMedium ?? ".padding-section-medium"

  return await page.evaluate(
    ({ paddingGlobalSel, containerLargeSel, sectionPaddingLargeSel, sectionPaddingMediumSel }) => {
      const cs = window.getComputedStyle(document.body)

      const body: Record<string, string> = {
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        fontWeight: cs.fontWeight,
        color: cs.color,
        fontFamily: cs.fontFamily,
        backgroundColor: cs.backgroundColor,
      }

      const paddingGlobal = document.querySelector(paddingGlobalSel)
      const containerLarge = document.querySelector(containerLargeSel)
      const container: Record<string, string> = { maxWidth: "1280px", paddingValue: "5%" }
      if (paddingGlobal) {
        const pcs = window.getComputedStyle(paddingGlobal)
        container.computedPaddingLeft = pcs.paddingLeft
        container.computedPaddingRight = pcs.paddingRight
      }
      if (containerLarge) {
        const ccs = window.getComputedStyle(containerLarge)
        container.maxWidth = ccs.maxWidth
        container.computedWidth = ccs.width
      }

      const sectionPadding: Record<string, { top: string; bottom: string }> = {}
      const psl = document.querySelector(sectionPaddingLargeSel)
      if (psl) {
        const scs = window.getComputedStyle(psl)
        sectionPadding.large = { top: scs.paddingTop, bottom: scs.paddingBottom }
      }
      const psm = document.querySelector(sectionPaddingMediumSel)
      if (psm) {
        const scs = window.getComputedStyle(psm)
        sectionPadding.medium = { top: scs.paddingTop, bottom: scs.paddingBottom }
      }

      const spacers: Record<string, string> = {}
      for (const cls of [
        "spacer-tiny", "spacer-xxsmall", "spacer-xsmall", "spacer-small",
        "spacer-medium", "spacer-large", "spacer-xlarge", "spacer-xxlarge",
        "spacer-huge", "spacer-xhuge", "spacer-xxhuge",
      ]) {
        const el = document.querySelector(`.${cls}`)
        if (el) spacers[cls] = window.getComputedStyle(el).paddingTop
      }

      const resets: Record<string, string> = {}
      const h1 = document.querySelector("h1")
      if (h1) {
        const hcs = window.getComputedStyle(h1)
        resets.h1MarginTop = hcs.marginTop
        resets.h1MarginBottom = hcs.marginBottom
      }
      const p = document.querySelector("p")
      if (p) {
        const pcs = window.getComputedStyle(p)
        resets.pMarginTop = pcs.marginTop
        resets.pMarginBottom = pcs.marginBottom
      }

      return { body, container, sectionPadding, spacers, resets }
    },
    { paddingGlobalSel, containerLargeSel, sectionPaddingLargeSel, sectionPaddingMediumSel }
  )
}

export function deriveSectionLabel(className: string, tag: string, firstHeading: string, index: number): string {
  const classLabel = className
    .split(" ")
    .find((c: string) =>
      c.startsWith("section_") || c.startsWith("section-") ||
      c.includes("navbar") || c.includes("footer") || c.includes("banner") || c.includes("hero")
    )
    || className.split(" ")[0]
    || tag
  const rawLabel = classLabel.replace(/^section_/, "").replace(/_/g, "-")
  const normalizedRawLabel = rawLabel.toLowerCase()
  return normalizedRawLabel === "section" || normalizedRawLabel === "overflow-hidden"
    ? firstHeading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || `section-${index}`
    : rawLabel
}

// --- Main orchestration ---

export async function extractSectionsAtViewport(
  page: Page,
  viewport: number,
  adapter: MergedAdapter | null,
  opts?: { customSelector?: string; isLargestViewport?: boolean; quiet?: boolean }
): Promise<ViewportExtractionResult> {
  const isLargest = opts?.isLargestViewport ?? false

  let globals: GlobalFoundation | undefined
  if (isLargest) {
    globals = await extractGlobalFoundation(page, adapter)
  }

  const { handles, meta: discoveryMeta } = await discoverSections(page, {
    customSelector: opts?.customSelector,
    quiet: opts?.quiet ?? !isLargest,
    adapter: adapter?.sectionDiscovery,
  })

  if (isLargest) {
    console.log(`Found ${handles.length} sections`)
  }

  const sections: ViewportSectionData[] = []

  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i]
    const sectionInfo = await handle.evaluate((node) => {
      const el = node as Element
      const rect = el.getBoundingClientRect()
      const className = (el.className as unknown as string)?.toString?.() || ""
      const firstHeading = el.querySelector("h1, h2, h3")?.textContent?.trim().slice(0, 60) || ""
      const textPreview = el.textContent?.trim().slice(0, 100) || ""
      const hasVideo = el.querySelector("video") !== null
      const hasBackgroundImage = getComputedStyle(el).backgroundImage !== "none"
      const hasInteractiveLinks = el.querySelector("a, button") !== null
      return {
        tag: el.tagName.toLowerCase(),
        className,
        firstHeading,
        textPreview,
        hasVideo,
        hasBackgroundImage,
        hasInteractiveLinks,
        bounds: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
      }
    })

    const derivedClassHint = deriveClassHint(sectionInfo.tag, sectionInfo.className)
    const firstHeading = sectionInfo.firstHeading
    const label = deriveSectionLabel(sectionInfo.className, sectionInfo.tag, firstHeading, i)
    const classHint = resolveSectionClassHint(derivedClassHint, label)
    const semanticRole = deriveSemanticRole({
      tag: sectionInfo.tag,
      classHint,
      firstHeading,
      textPreview: sectionInfo.textPreview,
      hasVideo: sectionInfo.hasVideo,
      hasBackgroundImage: sectionInfo.hasBackgroundImage,
      hasInteractiveLinks: sectionInfo.hasInteractiveLinks,
    })

    const elementSpec = await extractElement(page, handle, 0)
    if (!elementSpec) {
      if (isLargest) console.log(`    Skipping ${label} (no visible content)`)
      continue
    }

    if (isLargest) {
      await extractHoverStates(page, handle, elementSpec)
    }

    const flatElements = flattenElementsById(elementSpec)
    const viewportStyles = new Map<string, Record<string, string>>()
    for (const [id, flatEl] of Array.from(flatElements)) {
      viewportStyles.set(id, flatEl.rawStyles)
    }

    sections.push({
      label,
      index: i,
      tag: sectionInfo.tag,
      classHint,
      firstHeading,
      textPreview: sectionInfo.textPreview,
      semanticRole,
      hasVideo: sectionInfo.hasVideo,
      hasBackgroundImage: sectionInfo.hasBackgroundImage,
      hasInteractiveLinks: sectionInfo.hasInteractiveLinks,
      bounds: sectionInfo.bounds,
      elementTree: elementSpec,
      flatElements,
      viewportStyles,
    })
  }

  return { viewport, sections, globals, discoveryMeta }
}

// --- Viewport height mapping for resize-in-place ---

const VIEWPORT_HEIGHTS: Record<number, number> = {
  375: 812,
  768: 1024,
  1024: 900,
  1440: 900,
}

function viewportHeight(width: number): number {
  return VIEWPORT_HEIGHTS[width] ?? 900
}

/**
 * Extract multi-viewport data by resizing the page in place.
 * Used by flow-based extraction where the page state can't be recreated via navigation.
 * Extracts at each viewport from largest → smallest, then restores original size.
 */
export async function extractSectionsMultiViewportResize(
  page: Page,
  viewports: number[],
  adapter: MergedAdapter | null,
  opts?: { customSelector?: string }
): Promise<Map<number, ViewportExtractionResult>> {
  const sortedViewports = [...viewports].sort((a, b) => b - a) // largest first
  const largest = sortedViewports[0]
  const results = new Map<number, ViewportExtractionResult>()

  const originalViewport = page.viewportSize()

  for (const vw of sortedViewports) {
    await page.setViewportSize({ width: vw, height: viewportHeight(vw) })
    await page.waitForTimeout(500) // CSS reflow

    const isLargest = vw === largest
    const result = await extractSectionsAtViewport(page, vw, adapter, {
      customSelector: opts?.customSelector,
      isLargestViewport: isLargest,
    })
    results.set(vw, result)
  }

  if (originalViewport) {
    await page.setViewportSize(originalViewport)
    await page.waitForTimeout(300)
  }

  return results
}

export function assembleMultiViewportOutput(
  viewportResults: ViewportExtractionResult[],
  viewports: number[],
  url: string,
  projectRoot: string,
  adapter: MergedAdapter | null,
  extractionMethod = "extract-styles"
): StyleExtractionOutput {
  const sortedViewports = [...viewports].sort((a, b) => a - b)
  const largestViewport = sortedViewports[sortedViewports.length - 1]
  const isMultiViewport = viewports.length > 1
  const mapper = createMapper(projectRoot)

  const largestResult = viewportResults.find(r => r.viewport === largestViewport)
  if (!largestResult) throw new Error(`No extraction result for largest viewport ${largestViewport}. Available: ${viewportResults.map(r => r.viewport).join(", ")}`)
  const globals = largestResult.globals ?? null

  // Build cross-viewport element map per section
  type CrossViewportSection = {
    index: number
    label: string
    tag: string
    classHint: string
    firstHeading: string
    textPreview: string
    semanticRole: SemanticRole
    hasVideo: boolean
    hasBackgroundImage: boolean
    hasInteractiveLinks: boolean
    bounds: { x: number; y: number; width: number; height: number }
    elementTree: ElementSpec | null
    flatElements: Map<string, FlatElement>
    viewportElements: Map<string, Map<number, Record<string, string>>>
  }

  const sectionMap = new Map<string, CrossViewportSection>()
  const sectionOrder: string[] = []

  // First pass: register sections from largest viewport (defines order)
  for (const section of largestResult.sections) {
    const key = getSectionKey(section)
    sectionMap.set(key, {
      index: section.index,
      label: section.label,
      tag: section.tag,
      classHint: section.classHint,
      firstHeading: section.firstHeading,
      textPreview: section.textPreview,
      semanticRole: section.semanticRole,
      hasVideo: section.hasVideo,
      hasBackgroundImage: section.hasBackgroundImage,
      hasInteractiveLinks: section.hasInteractiveLinks,
      bounds: section.bounds,
      elementTree: section.elementTree,
      flatElements: section.flatElements,
      viewportElements: new Map(),
    })
    sectionOrder.push(key)

    for (const [id, styles] of Array.from(section.viewportStyles)) {
      const data = sectionMap.get(key)!
      if (!data.viewportElements.has(id)) data.viewportElements.set(id, new Map())
      data.viewportElements.get(id)!.set(largestViewport, styles)
    }
  }

  // Merge in other viewport data
  for (const result of viewportResults) {
    if (result.viewport === largestViewport) continue
    for (const section of result.sections) {
      const data = sectionMap.get(getSectionKey(section))
      if (!data) continue
      for (const [id, styles] of Array.from(section.viewportStyles)) {
        if (!data.viewportElements.has(id)) data.viewportElements.set(id, new Map())
        data.viewportElements.get(id)!.set(result.viewport, styles)
      }
    }
  }

  // Generate output sections
  const outputSections: StyleExtractionOutput["sections"] = []

  for (let idx = 0; idx < sectionOrder.length; idx++) {
    const key = sectionOrder[idx]
    const data = sectionMap.get(key)!
    if (!data.elementTree) continue

    const paddedIndex = String(idx + 1).padStart(2, "0")
    console.log(`  [${paddedIndex}] ${data.label}`)

    const structureTree = renderStructureTree(data.elementTree)

    let styleEntries: StyleEntry[]

    if (isMultiViewport) {
      styleEntries = []
      for (const [id, vpStyles] of Array.from(data.viewportElements)) {
        const flatEl = data.flatElements.get(id)
        if (!flatEl) continue

        const presentAt = Array.from(vpStyles.keys()).sort((a, b) => a - b)
        let visibilityClass = ""
        if (presentAt.length < sortedViewports.length) {
          visibilityClass = getVisibilityClass(presentAt[0])
        }

        const wrapperClasses = mapWrapperClasses(flatEl.className, flatEl.rawStyles, adapter)
        const classes = wrapperClasses ?? mapper.mapMultiViewportStyles(vpStyles, viewports)
        const cleanedClasses = wrapperClasses ? classes : mapper.cleanClasses(classes, { tag: flatEl.tag, className: flatEl.className, bounds: flatEl.bounds })
        const fullClasses = visibilityClass ? `${visibilityClass} ${cleanedClasses}` : cleanedClasses

        const entry: StyleEntry = {
          selector: flatEl.selector,
          text: flatEl.text,
          classes: fullClasses,
          rawStyles: flatEl.rawStyles,
          pseudoElements: flatEl.pseudoElements,
        }

        if (flatEl.hover) {
          entry.hover = flatEl.hover
          const hoverStyles: Record<string, string> = {}
          for (const [key, { to }] of Object.entries(flatEl.hover)) hoverStyles[key] = to
          entry.hoverClasses = mapper.mapStyles(hoverStyles)
        }

        if (["h1", "h2", "h3", "h4"].includes(flatEl.tag)) {
          entry.verify = `${flatEl.text.slice(0, 30)} must be ${flatEl.rawStyles.fontSize || "?"} ${flatEl.rawStyles.fontWeight || "?"} ${flatEl.rawStyles.fontFamily?.split(",")[0] || "?"}`
        }
        if (flatEl.className.includes("tagline") || flatEl.className.includes("button")) {
          entry.verify = `${flatEl.text.slice(0, 30)} must be ${flatEl.rawStyles.fontSize || "?"} ${flatEl.rawStyles.fontWeight || "?"} ${flatEl.rawStyles.textTransform || ""}`
        }

        styleEntries.push(entry)
      }
    } else {
      styleEntries = flattenStyles(data.elementTree, mapper, adapter)
    }

    outputSections.push({
      index: data.index,
      label: data.label,
      tag: data.tag,
      classHint: data.classHint,
      firstHeading: data.firstHeading,
      textPreview: data.textPreview,
      semanticRole: data.semanticRole,
      hasVideo: data.hasVideo,
      hasBackgroundImage: data.hasBackgroundImage,
      hasInteractiveLinks: data.hasInteractiveLinks,
      bounds: data.bounds,
      structureTree,
      styleEntries,
    })
  }

  const viewportStructures: Record<string, string> = {}
  for (const vpResult of viewportResults) {
    const vw = vpResult.viewport
    const vh = VIEWPORT_HEIGHTS[vw] ?? 900
    const vpKey = `${vw}x${vh}`
    const trees: string[] = []
    for (const section of vpResult.sections) {
      if (section.elementTree) {
        trees.push(`## ${section.label}\n\n${renderStructureTree(section.elementTree)}`)
      }
    }
    if (trees.length > 0) {
      viewportStructures[vpKey] = trees.join("\n---\n\n")
    }
  }

  return {
    url,
    viewports,
    format: isMultiViewport ? "v3-responsive" : "v2",
    extractionMethod,
    globals,
    sectionDiscoveryMeta: largestResult.discoveryMeta,
    viewportStructures,
    sections: outputSections,
  }
}

export function writeStyleOutput(output: StyleExtractionOutput, outputDir: string) {
  mkdirSync(outputDir, { recursive: true })

  if (output.globals) {
    writeFileSync(
      join(outputDir, "00-globals.json"),
      JSON.stringify(output.globals, null, 2)
    )
    console.log("  [00] globals extracted")
  }

  const manifest: Array<
    Pick<
      StyleExtractionSectionOutput,
      | "index"
      | "label"
      | "tag"
      | "classHint"
      | "firstHeading"
      | "textPreview"
      | "semanticRole"
      | "hasVideo"
      | "hasBackgroundImage"
      | "hasInteractiveLinks"
      | "bounds"
    > & {
      structureFile: string
      stylesFile: string
    }
  > = []

  for (const section of output.sections) {
    const paddedIndex = String(section.index + 1).padStart(2, "0")

    const structureFile = `${paddedIndex}-${section.label}.structure.md`
    writeFileSync(
      join(outputDir, structureFile),
      `# ${paddedIndex}-${section.label}\n\n## Element Tree\n\n${section.structureTree}`
    )

    const stylesFile = `${paddedIndex}-${section.label}.styles.json`
    writeFileSync(join(outputDir, stylesFile), JSON.stringify(section.styleEntries, null, 2))
    console.log(`    → ${structureFile} (tree) + ${stylesFile} (${section.styleEntries.length} elements)`)

    manifest.push({
      index: section.index,
      label: section.label,
      tag: section.tag,
      classHint: section.classHint,
      firstHeading: section.firstHeading,
      textPreview: section.textPreview,
      semanticRole: section.semanticRole,
      hasVideo: section.hasVideo,
      hasBackgroundImage: section.hasBackgroundImage,
      hasInteractiveLinks: section.hasInteractiveLinks,
      bounds: section.bounds,
      structureFile,
      stylesFile,
    })
  }

  if (output.viewportStructures) {
    for (const [vpKey, tree] of Object.entries(output.viewportStructures)) {
      const vpStructFile = `structure-${vpKey}.md`
      writeFileSync(
        join(outputDir, vpStructFile),
        `# Structure at ${vpKey}\n\n${tree}`
      )
    }
  }

  writeFileSync(
    join(outputDir, "manifest.json"),
    JSON.stringify({
      url: output.url,
      extractedAt: new Date().toISOString(),
      format: output.format,
      viewports: output.viewports,
      extractionMethod: output.extractionMethod,
      sectionDiscovery: output.sectionDiscoveryMeta ?? { unwrapApplied: false },
      sections: manifest,
    }, null, 2)
  )

  console.log(`\nDone! ${manifest.length} sections extracted to ${outputDir}/`)
}
