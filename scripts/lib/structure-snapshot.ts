import type { Page } from "@playwright/test"
import type { AdapterSectionDiscovery } from "./adapter-loader.ts"
import { discoverSections } from "./section-discovery.ts"

export type SemanticRole =
  | "header"
  | "nav"
  | "hero"
  | "content"
  | "footer"
  | "unknown"

export interface StructuralBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface StructuralSection {
  index: number
  label: string
  tag: string
  classHint: string
  firstHeading: string
  textPreview: string
  bounds: StructuralBounds
  semanticRole: SemanticRole
  hasVideo: boolean
  hasBackgroundImage: boolean
  hasInteractiveLinks: boolean
}

const GENERIC_CLASS_HINTS = new Set([
  "",
  "body",
  "app",
  "root",
  "main",
  "section",
  "wrapper",
  "container",
  "component",
  "div",
  "padding-global",
  "container-large",
  "container-small",
  "padding-section",
  "padding-section-large",
  "padding-section-medium",
])

export function deriveClassHint(tag: string, className: string): string {
  const classes = className
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  return (
    classes.find(
      (c) =>
        c.startsWith("section_") ||
        c.startsWith("section-") ||
        c.includes("navbar") ||
        c.includes("footer") ||
        c.includes("banner") ||
        c.includes("hero")
    ) ||
    classes[0] ||
    tag
  )
}

export function resolveStructuralSectionHint(classHint: string, firstHeading: string, index: number): string {
  if (!GENERIC_CLASS_HINTS.has(classHint.toLowerCase())) return classHint
  const headingLabel = firstHeading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30)
  return headingLabel || `section-${index}`
}

export function deriveSemanticRole(input: {
  tag: string
  classHint: string
  firstHeading: string
  textPreview: string
  hasVideo: boolean
  hasBackgroundImage: boolean
  hasInteractiveLinks: boolean
}): SemanticRole {
  const hint = `${input.tag} ${input.classHint} ${input.firstHeading} ${input.textPreview}`.toLowerCase()
  const normalizedClassHint = input.classHint.trim().toLowerCase()
  const hasHeading = input.firstHeading.trim().length > 0
  const hasHeroCue =
    hint.includes("hero") ||
    hint.includes("banner") ||
    hint.includes("intro") ||
    hint.includes("masthead") ||
    hint.includes("showcase") ||
    hint.includes("lead")
  const hasStrongHeroSignal = hasHeading && (input.hasBackgroundImage || input.hasVideo || input.hasInteractiveLinks)
  const hasNeutralHeroSignal = hasHeading && (input.hasBackgroundImage || input.hasVideo)
  const hasStrongContentSignal =
    hasHeading ||
    input.hasVideo ||
    input.hasBackgroundImage ||
    input.hasInteractiveLinks ||
    (normalizedClassHint.length > 0 && !GENERIC_CLASS_HINTS.has(normalizedClassHint))
  if (
    input.tag === "nav" ||
    hint.includes("navbar") ||
    hint.includes("navigation") ||
    (input.tag === "header" &&
      (hint.includes("navbar") || hint.includes("navigation") || hint.includes("menu")))
  ) {
    return "nav"
  }
  if (input.tag === "footer" || hint.includes("footer")) return "footer"
  if (
    input.tag !== "nav" &&
    (hasNeutralHeroSignal || (hasHeroCue && hasStrongHeroSignal))
  ) {
    return "hero"
  }
  if (input.tag === "header") return "header"
  if (
    (input.tag === "main" || input.tag === "section" || input.tag === "div") &&
    hasStrongContentSignal
  ) {
    return "content"
  }
  return "unknown"
}

export interface SnapshotStructuralSectionsOptions {
  customSelector?: string
  adapter?: AdapterSectionDiscovery
  quiet?: boolean
}

const SKIP_TAGS = new Set(["script", "noscript", "style", "link", "dialog"])

type DiscoveryHandles = Awaited<ReturnType<typeof discoverSections>>["handles"]

async function matchesAnySelector(
  handle: DiscoveryHandles[number],
  selectors: string[]
): Promise<boolean> {
  if (selectors.length === 0) return false
  return handle
    .evaluate((node, sel) => {
      const el = node as Element
      return sel.some((selector) => {
        try {
          return el.matches(selector)
        } catch {
          return false
        }
      })
    }, selectors)
    .catch(() => false)
}

async function filterSkippedHandles(
  handles: DiscoveryHandles,
  skipSelectors: string[]
): Promise<DiscoveryHandles> {
  if (skipSelectors.length === 0) return handles
  const result: DiscoveryHandles = []
  for (const handle of handles) {
    if (!(await matchesAnySelector(handle, skipSelectors))) {
      result.push(handle)
    }
  }
  return result
}

async function flattenTopLevelMain(
  handles: DiscoveryHandles,
  skipSelectors: string[]
): Promise<DiscoveryHandles> {
  const mainIndex = await Promise.all(
    handles.map((handle) =>
      handle
        .evaluate((node) => {
          const el = node as Element
          return el.tagName.toLowerCase() === "main"
        })
        .catch(() => false)
    )
  ).then((matches) => matches.findIndex(Boolean))

  if (mainIndex < 0) return handles

  const mainHandle = handles[mainIndex]
  const children = await mainHandle.$$(":scope > *")
  if (children.length === 0) return handles

  const visibleChildren: DiscoveryHandles = []
  for (const child of children) {
    if (await matchesAnySelector(child, skipSelectors)) continue
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
    if (SKIP_TAGS.has(info.tag)) continue
    const visible =
      info.height > 10 ||
      ((info.position === "absolute" || info.position === "fixed") && info.scrollHeight > 10)
    if (visible) visibleChildren.push(child)
  }

  if (visibleChildren.length === 0) return handles

  return [...handles.slice(0, mainIndex), ...visibleChildren, ...handles.slice(mainIndex + 1)]
}

export async function snapshotStructuralSections(
  page: Page,
  options?: SnapshotStructuralSectionsOptions
): Promise<StructuralSection[]> {
  const discovery = await discoverSections(page, {
    customSelector: options?.customSelector,
    adapter: options?.adapter,
    quiet: options?.quiet ?? true,
  })

  const skippedSelectors = options?.adapter?.skipSelectors ?? []
  const filteredHandles = await filterSkippedHandles(discovery.handles, skippedSelectors)
  const handles = await flattenTopLevelMain(filteredHandles, skippedSelectors)

  const sections = await Promise.all(
    handles.map(async (handle, index) =>
      handle.evaluate((node, idx) => {
        const el = node as Element
        const rect = el.getBoundingClientRect()
        const className = (el.className?.toString?.() || "").trim()
        const firstHeading = el.querySelector("h1, h2, h3")?.textContent?.trim().slice(0, 60) || ""
        const textPreview = el.textContent?.trim().slice(0, 100) || ""
        const hasVideo = el.querySelector("video") !== null
        const hasBackgroundImage = getComputedStyle(el).backgroundImage !== "none"
        const hasInteractiveLinks = el.querySelector("a, button") !== null
        return {
          index: idx,
          tag: el.tagName.toLowerCase(),
          className,
          firstHeading,
          textPreview,
          bounds: {
            x: Math.round(rect.x),
            y: Math.round(rect.y + window.scrollY),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          hasVideo,
          hasBackgroundImage,
          hasInteractiveLinks,
        }
      }, index)
    )
  )

  return sections.map((section) => {
    const resolvedHint = resolveStructuralSectionHint(
      deriveClassHint(section.tag, section.className),
      section.firstHeading,
      section.index
    )
    return {
      index: section.index,
      label: resolvedHint,
      tag: section.tag,
      classHint: resolvedHint,
      firstHeading: section.firstHeading,
      textPreview: section.textPreview,
      bounds: section.bounds,
      hasVideo: section.hasVideo,
      hasBackgroundImage: section.hasBackgroundImage,
      hasInteractiveLinks: section.hasInteractiveLinks,
      semanticRole: deriveSemanticRole({
        tag: section.tag,
        classHint: resolvedHint,
        firstHeading: section.firstHeading,
        textPreview: section.textPreview,
        hasVideo: section.hasVideo,
        hasBackgroundImage: section.hasBackgroundImage,
        hasInteractiveLinks: section.hasInteractiveLinks,
      }),
    }
  })
}
