import type { Page } from "@playwright/test"
import { writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join, extname, basename } from "node:path"
import * as https from "node:https"
import * as http from "node:http"
import { createHash } from "node:crypto"
import { discoverSections } from "./section-discovery.ts"
import type { MergedAdapter } from "./adapter-loader.ts"
import { deriveSectionLabel } from "./extract-styles-core.ts"

function siteDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return "unknown"
  }
}

export interface ImageEntry {
  originalUrl: string
  localPath: string
  alt: string
  dimensions: { x: number; y: number; width: number; height: number }
  type: "img" | "css-background"
  parentClassName: string
}

export interface InlineSvgEntry {
  outerHTML: string
  localPath: string
  alt: string
  width: number
  height: number
  parentTag: string
  parentClassName: string
  nearestHref: string
  nearestText: string
  roleHint: SvgRoleHint
  domOrder: number
}

export interface SectionImages {
  index: number
  label: string
  images: ImageEntry[]
  inlineSvgs: InlineSvgEntry[]
}

export type SvgRoleHint =
  | "logo"
  | "social-icon"
  | "breadcrumb-icon"
  | "chevron"
  | "menu-icon"
  | "unknown"

export interface ShellControlEntry {
  kind: "button" | "link"
  text: string
  href: string
  className: string
  width: number
  height: number
  childWidths: number[]
  lastChildHasLeftBorder: boolean
  parentTag: string
  parentClassName: string
  roleHint: "nav-trigger" | "action" | "social-link" | "language-trigger" | "legal-link" | "unknown"
  backgroundColor?: string
  textColor?: string
  border?: string
  borderRadius?: number
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
}

export interface ExpandedShellItemEntry {
  label: string
  href: string
  kind: "button" | "link"
  className: string
  width: number
  height: number
  backgroundColor: string
  border?: string
  borderRadius?: number
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
}

export interface ExpandedShellPanelEntry {
  width: number
  height: number
  layoutMode: "list" | "grid" | "unknown"
  columnCount: number
  rowGap: number
  columnGap: number
  borderRadius: number
  offsetX: number
  offsetY: number
  averageItemWidth: number
  averageItemHeight: number
  containerClassName: string
  backgroundColor?: string
  border?: string
  boxShadow?: string
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
}

export interface ExpandedShellTriggerEntry {
  label: string
  kind: "button" | "link"
  roleHint: ShellControlEntry["roleHint"]
  interactionMode: "click" | "unknown"
  items: ExpandedShellItemEntry[]
  panel: ExpandedShellPanelEntry | null
}

export interface ShellWrapperEntry {
  role: string
  className: string
  width: number
  height: number
  backgroundColor: string
  display?: string
  justifyContent?: string
  justifySelf?: string
  alignItems?: string
  alignSelf?: string
  marginTop?: number
  marginRight?: number
  marginBottom?: number
  marginLeft?: number
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
}

export interface ShellSectionEntry {
  index: number
  label: string
  sectionTag: string
  interactionMode: "hover" | "click" | "both" | "unknown"
  controls: ShellControlEntry[]
  inlineSvgs: InlineSvgEntry[]
  expandedTriggers: ExpandedShellTriggerEntry[]
  wrappers: ShellWrapperEntry[]
}

export interface ShellSummaryControlEntry {
  label: string
  href: string
  kind: "button" | "link"
  className: string
  width: number
  height: number
  childWidths: number[]
  lastChildHasLeftBorder: boolean
  backgroundColor: string
  textColor: string
  border: string
  borderRadius: number
  paddingTop: number
  paddingRight: number
  paddingBottom: number
  paddingLeft: number
}

export interface ShellSummaryActionEntry extends ShellSummaryControlEntry {
  variantHint: "primary" | "secondary" | "ghost" | "unknown"
}

export interface ShellSummaryNavGroupEntry {
  label: string
  chevronIconPath: string
  items: ShellSummaryControlEntry[]
}

export interface ShellSummaryHeaderEntry {
  sectionLabel: string
  interactionMode: "hover" | "click" | "both" | "unknown"
  logoPath: string
  logoWidth: number
  logoHeight: number
  navGroups: ShellSummaryNavGroupEntry[]
  topLinks: ShellSummaryControlEntry[]
  actions: ShellSummaryActionEntry[]
  expandedTriggers: ExpandedShellTriggerEntry[]
}

export interface ShellSummaryFooterEntry {
  sectionLabel: string
  wrapperOrder: ShellWrapperEntry[]
  breadcrumbLinks: ShellSummaryControlEntry[]
  socialLinks: ShellSummaryControlEntry[]
  socialIconPaths: string[]
  primaryLinks: ShellSummaryControlEntry[]
  legalLinks: ShellSummaryControlEntry[]
  languageControl: ShellSummaryControlEntry | null
  logoPath: string
  logoWidth: number
  logoHeight: number
  languageChevronPath: string
  expandedTriggers: ExpandedShellTriggerEntry[]
}

export interface ShellSummary {
  url: string
  extractedAt: string
  header: ShellSummaryHeaderEntry | null
  footer: ShellSummaryFooterEntry | null
}

export interface ImageExtractionResult {
  url: string
  sections: SectionImages[]
  shellSections: ShellSectionEntry[]
  totalImages: number
}

export function resolveImageUrl(input: { src: string | null; currentSrc: string | null }): string | null {
  const src = input.src?.trim() || ""
  const currentSrc = input.currentSrc?.trim() || ""

  if (currentSrc && !currentSrc.startsWith("data:")) {
    return currentSrc
  }

  if (src && !src.startsWith("data:")) {
    return src
  }

  return null
}

export function inferSvgRoleHint(input: {
  alt: string
  parentTag: string
  parentClassName: string
  nearestHref: string
  nearestText: string
}): SvgRoleHint {
  const haystack = [
    input.alt,
    input.parentTag,
    input.parentClassName,
    input.nearestHref,
    input.nearestText,
  ]
    .join(" ")
    .toLowerCase()

  if (haystack.includes("menu") || haystack.includes("hamburger")) return "menu-icon"
  if (haystack.includes("chevron") || haystack.includes("caret") || haystack.includes("arrow")) return "chevron"
  if (haystack.includes("breadcrumb") || haystack.includes("home")) return "breadcrumb-icon"
  if (/\b(facebook|linkedin|youtube|instagram|twitter|x square|x-twitter|social)\b/.test(haystack)) {
    return "social-icon"
  }
  if (/\b(doodle|logo|brand)\b/.test(haystack) && !/\b(facebook|linkedin|youtube|instagram|twitter)\b/.test(haystack)) {
    return "logo"
  }
  return "unknown"
}

function normalizeShellText(text: string) {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/ArrowRightIcon/gi, "")
    .replace(/Arrow\s+Right/gi, "")
    .replace(/Chevron\s+Right/gi, "")
    .replace(/Chevron\s+Down/gi, "")
    .replace(/ChevronRight/gi, "")
    .replace(/ChevronDownIcon/gi, "")
    .replace(/Icon/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

function compactShellLabel(text: string) {
  const normalized = normalizeShellText(text)
  if (!normalized) return ""

  const exactKnownLabels = [
    "Create a Doodle",
    "Log in",
    "Sign up",
    "Legal Notice",
    "Help Center",
    "Contact Sales",
    "Time institute",
    "Research Program",
    "Talk to sales",
    "Privacy Settings",
    "Healthcare & wellness",
    "Professional services",
    "New Operating System of Time",
    "Group Poll",
    "Sign-up Sheet",
    "1:1",
    "Booking Page",
    "Integrations",
    "Collect payments",
    "Security",
  ]
  const knownMatch = exactKnownLabels.find(label => normalized.startsWith(label))
  if (knownMatch) return knownMatch

  const titlePrefix = normalized.match(/^[A-Z0-9][A-Za-z0-9:&-]*(?:\s+[A-Z0-9][A-Za-z0-9:&-]*){0,3}/)?.[0]?.trim() || ""
  if (titlePrefix) return titlePrefix

  return normalized
}

function dedupeControls<T extends { label: string; href: string; kind: string }>(items: T[]) {
  const seen = new Set<string>()
  const unique: T[] = []
  for (const item of items) {
    const key = `${item.kind}|${item.label}|${item.href}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(item)
  }
  return unique
}

function inferActionVariant(label: string): "primary" | "secondary" | "ghost" | "unknown" {
  const normalized = label.toLowerCase()
  if (normalized === "create a doodle") return "primary"
  if (normalized === "sign up") return "secondary"
  if (normalized === "log in" || normalized === "privacy settings") return "ghost"
  return "unknown"
}

function topLevelTriggerItemKeys(trigger: ExpandedShellTriggerEntry) {
  return new Set(
    trigger.items
      .map(item => `${item.kind}|${compactShellLabel(item.label)}|${item.href}`)
  )
}

export function normalizeStandaloneSvg(svgMarkup: string) {
  const trimmed = svgMarkup.trim()
  if (!trimmed.startsWith("<svg")) return svgMarkup
  const nestedSvgMatch = trimmed.match(/^<svg\b[^>]*>([\s\S]*)<\/svg>$/i)
  let unwrapped = trimmed
  if (nestedSvgMatch) {
    const innerContent = nestedSvgMatch[1] ?? ""
    const innerSvgMatch = innerContent.match(/<svg\b[\s\S]*<\/svg>/i)
    if (innerSvgMatch) {
      const beforeInner = innerContent.slice(0, innerSvgMatch.index ?? 0)
      const afterInner = innerContent.slice((innerSvgMatch.index ?? 0) + innerSvgMatch[0].length)
      const nonGraphicOuterContent = `${beforeInner}${afterInner}`
        .replace(/<title\b[\s\S]*?<\/title>/gi, "")
        .replace(/<desc\b[\s\S]*?<\/desc>/gi, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .trim()
      if (!nonGraphicOuterContent) {
        unwrapped = innerSvgMatch[0]
      }
    }
  }
  if (/xmlns=/.test(unwrapped)) return unwrapped
  return unwrapped.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"')
}

function dedupeExpandedItems(items: ExpandedShellItemEntry[]) {
  return dedupeControls(items).filter(item => item.label || item.href)
}

export function deriveShellSummary(result: ImageExtractionResult): ShellSummary {
  const extractedAt = new Date().toISOString()
  const headerSection = result.shellSections.find(section => section.sectionTag === "header")
    ?? result.shellSections.find(section => /header/i.test(section.label))
    ?? null
  const footerSection = result.shellSections.find(section => section.sectionTag === "footer")
    ?? result.shellSections.find(section => /footer|theme-provider/i.test(section.label))
    ?? null

  const header: ShellSummaryHeaderEntry | null = headerSection ? (() => {
    const logoSvg = headerSection.inlineSvgs.find(svg => svg.roleHint === "logo") || null
    const logoPath = logoSvg?.localPath || ""
    const chevrons = new Map(
      headerSection.inlineSvgs
        .filter(svg => svg.roleHint === "chevron")
        .map(svg => [compactShellLabel(svg.alt), svg.localPath] as const)
    )

    const actions = dedupeControls(
      headerSection.controls
        .filter(control => control.roleHint === "action")
        .map(control => ({
          label: compactShellLabel(control.text),
          href: control.href,
          kind: control.kind,
          className: control.className,
          width: control.width,
          height: control.height,
          childWidths: control.childWidths,
          lastChildHasLeftBorder: control.lastChildHasLeftBorder,
          backgroundColor: control.backgroundColor || "rgba(0, 0, 0, 0)",
          textColor: control.textColor || "rgb(0, 0, 0)",
          border: control.border || "0px none rgb(0, 0, 0)",
          borderRadius: control.borderRadius ?? 0,
          paddingTop: control.paddingTop ?? 0,
          paddingRight: control.paddingRight ?? 0,
          paddingBottom: control.paddingBottom ?? 0,
          paddingLeft: control.paddingLeft ?? 0,
          variantHint: inferActionVariant(compactShellLabel(control.text)),
        }))
        .filter(control => control.label)
    )

    const navGroups: ShellSummaryNavGroupEntry[] = []
    const seenNavGroups = new Set<string>()
    let currentGroup: ShellSummaryNavGroupEntry | null = null
    let afterLastTrigger = false
    const topLinks: ShellSummaryControlEntry[] = []
    const expandedTriggerItems = new Map(
      headerSection.expandedTriggers.map(trigger => [compactShellLabel(trigger.label), topLevelTriggerItemKeys(trigger)] as const)
    )
    const allExpandedItemKeys = new Set(
      headerSection.expandedTriggers.flatMap(trigger => Array.from(topLevelTriggerItemKeys(trigger)))
    )

    for (const control of headerSection.controls) {
      const label = compactShellLabel(control.text)

      if (control.roleHint === "nav-trigger" && label) {
        if (seenNavGroups.has(label)) {
          currentGroup = navGroups.find(group => group.label === label) || null
          afterLastTrigger = true
          continue
        }
        seenNavGroups.add(label)
        currentGroup = {
          label,
          chevronIconPath: chevrons.get(label) || "",
          items: [],
        }
        navGroups.push(currentGroup)
        afterLastTrigger = true
        continue
      }

      if (control.roleHint === "action") {
        currentGroup = null
        continue
      }

      if (control.kind !== "link" || !label || !control.href) continue
      const currentGroupItemKeys = currentGroup ? expandedTriggerItems.get(currentGroup.label) : null
      const currentKey = `${control.kind}|${label}|${control.href}`
      if (
        currentGroup
        && currentGroupItemKeys?.has(currentKey)
        && !/log in|sign up|create a doodle/i.test(label)
      ) {
        currentGroup.items.push({
          label,
          href: control.href,
          kind: control.kind,
          className: control.className,
          width: control.width,
          height: control.height,
          childWidths: control.childWidths,
          lastChildHasLeftBorder: control.lastChildHasLeftBorder,
          backgroundColor: control.backgroundColor || "rgba(0, 0, 0, 0)",
          textColor: control.textColor || "rgb(0, 0, 0)",
          border: control.border || "0px none rgb(0, 0, 0)",
          borderRadius: control.borderRadius ?? 0,
          paddingTop: control.paddingTop ?? 0,
          paddingRight: control.paddingRight ?? 0,
          paddingBottom: control.paddingBottom ?? 0,
          paddingLeft: control.paddingLeft ?? 0,
        })
        continue
      }

      if (allExpandedItemKeys.has(currentKey)) continue

      if (afterLastTrigger) {
        topLinks.push({
          label,
          href: control.href,
          kind: control.kind,
          className: control.className,
          width: control.width,
          height: control.height,
          childWidths: control.childWidths,
          lastChildHasLeftBorder: control.lastChildHasLeftBorder,
          backgroundColor: control.backgroundColor || "rgba(0, 0, 0, 0)",
          textColor: control.textColor || "rgb(0, 0, 0)",
          border: control.border || "0px none rgb(0, 0, 0)",
          borderRadius: control.borderRadius ?? 0,
          paddingTop: control.paddingTop ?? 0,
          paddingRight: control.paddingRight ?? 0,
          paddingBottom: control.paddingBottom ?? 0,
          paddingLeft: control.paddingLeft ?? 0,
        })
      }
    }

    return {
      sectionLabel: headerSection.label,
      interactionMode: headerSection.interactionMode,
      logoPath,
      logoWidth: logoSvg?.width || 0,
      logoHeight: logoSvg?.height || 0,
      navGroups: navGroups.map(group => ({
        ...group,
        items: dedupeControls(group.items),
      })),
      topLinks: dedupeControls(topLinks),
      actions,
      expandedTriggers: headerSection.expandedTriggers.map(trigger => ({
        ...trigger,
        items: dedupeExpandedItems(trigger.items),
      })),
    }
  })() : null

  const footer: ShellSummaryFooterEntry | null = footerSection ? (() => {
    const logoSvg = footerSection.inlineSvgs.find(svg => svg.roleHint === "logo") || headerSection?.inlineSvgs.find(svg => svg.roleHint === "logo") || null
    const socialIconPaths = footerSection.inlineSvgs
      .filter(svg => svg.roleHint === "social-icon")
      .map(svg => svg.localPath)
    const languageChevronPath = footerSection.inlineSvgs.find(svg => svg.roleHint === "chevron")?.localPath || ""

    const breadcrumbLinks = dedupeControls(
      footerSection.controls
        .filter(control => /home|integrations/i.test(control.text) && control.href)
        .map(control => ({
          label: compactShellLabel(control.text),
          href: control.href,
          kind: control.kind,
          className: control.className,
          width: control.width,
          height: control.height,
          childWidths: control.childWidths,
          lastChildHasLeftBorder: control.lastChildHasLeftBorder,
          backgroundColor: control.backgroundColor || "rgba(0, 0, 0, 0)",
          textColor: control.textColor || "rgb(0, 0, 0)",
          border: control.border || "0px none rgb(0, 0, 0)",
          borderRadius: control.borderRadius ?? 0,
          paddingTop: control.paddingTop ?? 0,
          paddingRight: control.paddingRight ?? 0,
          paddingBottom: control.paddingBottom ?? 0,
          paddingLeft: control.paddingLeft ?? 0,
        }))
        .filter(control => control.label)
    )

    const socialLinks = dedupeControls(
      footerSection.controls
        .filter(control => control.roleHint === "social-link")
        .map(control => ({
          label: compactShellLabel(control.text),
          href: control.href,
          kind: control.kind,
          className: control.className,
          width: control.width,
          height: control.height,
          childWidths: control.childWidths,
          lastChildHasLeftBorder: control.lastChildHasLeftBorder,
          backgroundColor: control.backgroundColor || "rgba(0, 0, 0, 0)",
          textColor: control.textColor || "rgb(0, 0, 0)",
          border: control.border || "0px none rgb(0, 0, 0)",
          borderRadius: control.borderRadius ?? 0,
          paddingTop: control.paddingTop ?? 0,
          paddingRight: control.paddingRight ?? 0,
          paddingBottom: control.paddingBottom ?? 0,
          paddingLeft: control.paddingLeft ?? 0,
        }))
        .filter(control => control.label)
    )

    const languageControl = footerSection.controls
      .filter(control => control.roleHint === "language-trigger")
      .map(control => ({
        label: compactShellLabel(control.text),
        href: control.href,
        kind: control.kind,
        className: control.className,
        width: control.width,
        height: control.height,
        childWidths: control.childWidths,
        lastChildHasLeftBorder: control.lastChildHasLeftBorder,
        backgroundColor: control.backgroundColor || "rgba(0, 0, 0, 0)",
        textColor: control.textColor || "rgb(0, 0, 0)",
        border: control.border || "0px none rgb(0, 0, 0)",
        borderRadius: control.borderRadius ?? 0,
        paddingTop: control.paddingTop ?? 0,
        paddingRight: control.paddingRight ?? 0,
        paddingBottom: control.paddingBottom ?? 0,
        paddingLeft: control.paddingLeft ?? 0,
      }))
      .find(control => control.label) || null

    const legalLinks = dedupeControls(
      footerSection.controls
        .filter(control => control.roleHint === "legal-link")
        .map(control => ({
          label: compactShellLabel(control.text),
          href: control.href,
          kind: control.kind,
          className: control.className,
          width: control.width,
          height: control.height,
          childWidths: control.childWidths,
          lastChildHasLeftBorder: control.lastChildHasLeftBorder,
          backgroundColor: control.backgroundColor || "rgba(0, 0, 0, 0)",
          textColor: control.textColor || "rgb(0, 0, 0)",
          border: control.border || "0px none rgb(0, 0, 0)",
          borderRadius: control.borderRadius ?? 0,
          paddingTop: control.paddingTop ?? 0,
          paddingRight: control.paddingRight ?? 0,
          paddingBottom: control.paddingBottom ?? 0,
          paddingLeft: control.paddingLeft ?? 0,
        }))
        .filter(control => control.label)
    )

    const primaryLinks = dedupeControls(
      footerSection.controls
        .filter(control => control.roleHint === "unknown" && control.href)
        .map(control => ({
          label: compactShellLabel(control.text),
          href: control.href,
          kind: control.kind,
          className: control.className,
          width: control.width,
          height: control.height,
          childWidths: control.childWidths,
          lastChildHasLeftBorder: control.lastChildHasLeftBorder,
          backgroundColor: control.backgroundColor || "rgba(0, 0, 0, 0)",
          textColor: control.textColor || "rgb(0, 0, 0)",
          border: control.border || "0px none rgb(0, 0, 0)",
          borderRadius: control.borderRadius ?? 0,
          paddingTop: control.paddingTop ?? 0,
          paddingRight: control.paddingRight ?? 0,
          paddingBottom: control.paddingBottom ?? 0,
          paddingLeft: control.paddingLeft ?? 0,
        }))
        .filter(control => control.label && !/home|integrations/i.test(control.label))
    )

    return {
      sectionLabel: footerSection.label,
      wrapperOrder: footerSection.wrappers,
      breadcrumbLinks,
      socialLinks,
      socialIconPaths,
      primaryLinks,
      legalLinks,
      languageControl,
      logoPath: logoSvg?.localPath || "",
      logoWidth: logoSvg?.width || 0,
      logoHeight: logoSvg?.height || 0,
      languageChevronPath,
      expandedTriggers: footerSection.expandedTriggers.map(trigger => ({
        ...trigger,
        items: dedupeExpandedItems(trigger.items),
      })),
    }
  })() : null

  return {
    url: result.url,
    extractedAt,
    header,
    footer,
  }
}

function sanitizeFilename(raw: string) {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

function deriveFilename(url: string, alt: string) {
  const urlPath = new URL(url).pathname
  const ext = extname(urlPath) || ".png"
  const hash = createHash("md5").update(url).digest("hex").slice(0, 8)
  const altPrefix = alt ? sanitizeFilename(alt).slice(0, 30) : ""
  const urlBase = sanitizeFilename(basename(urlPath, ext)).slice(0, 30)
  const prefix = altPrefix || urlBase || "image"
  return `${prefix}-${hash}${ext}`
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const dir = join(dest, "..")
    mkdirSync(dir, { recursive: true })

    const client = url.startsWith("https") ? https : http
    client
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          downloadFile(res.headers.location, dest).then(resolve, reject)
          return
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`))
          return
        }
        const chunks: Buffer[] = []
        res.on("data", (chunk) => chunks.push(chunk))
        res.on("end", () => {
          writeFileSync(dest, Buffer.concat(chunks))
          resolve()
        })
        res.on("error", reject)
      })
      .on("error", reject)
  })
}

export async function extractImagesFromPage(
  page: Page,
  pageName: string,
  adapter: MergedAdapter | null,
  opts?: { scrollForLazy?: boolean }
): Promise<ImageExtractionResult> {
  const shouldScroll = opts?.scrollForLazy !== false
  const pageUrl = page.url()

  if (shouldScroll) {
    const urlBefore = page.url()
    const pageHeight = await page.evaluate(() => document.body.scrollHeight)
    for (let y = 0; y < pageHeight; y += 500) {
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y)
      await page.waitForTimeout(200)
      if (page.url() !== urlBefore) {
        await page.goto(urlBefore, { waitUntil: "domcontentloaded", timeout: 30000 })
        break
      }
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(1000)
  }

  const { handles } = await discoverSections(page, { adapter: adapter?.sectionDiscovery })
  console.log(`Found ${handles.length} sections`)

  const seenUrls = new Set<string>()
  const sections: SectionImages[] = []
  const shellSections: ShellSectionEntry[] = []

  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i]

    const sectionInfo = await handle.evaluate((el: Element) => ({
      className: el.className?.toString?.() || "",
      tag: el.tagName.toLowerCase(),
    }))

    const firstHeading = await handle.evaluate((el: Element) =>
      el.querySelector("h1, h2, h3")?.textContent?.trim().slice(0, 40) || ""
    )

    const label = deriveSectionLabel(sectionInfo.className, sectionInfo.tag, firstHeading, i)

    const paddedIndex = String(i + 1).padStart(2, "0")
    const sectionLabel = `${paddedIndex}-${label}`
    console.log(`\n  [${sectionLabel}]`)

    const images: ImageEntry[] = []
    const inlineSvgs: InlineSvgEntry[] = []

    // Extract <img> elements
    const imgData = await handle.evaluate((el: Element) => {
      const results: {
        src: string
        currentSrc: string
        alt: string
        bounds: { x: number; y: number; width: number; height: number }
        parentClassName: string
      }[] = []
      const imgs = Array.from(el.querySelectorAll("img"))
      for (const img of imgs) {
        const rect = img.getBoundingClientRect()
        if (rect.width < 5 || rect.height < 5) continue
        const src = img.getAttribute("src") || ""
        const currentSrc = img.currentSrc || ""
        results.push({
          src,
          currentSrc,
          alt: img.alt || "",
          bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          parentClassName: img.parentElement?.className?.toString?.() || "",
        })
      }
      return results
    })

    for (const img of imgData) {
      const resolvedUrl = resolveImageUrl({ src: img.src, currentSrc: img.currentSrc })
      if (!resolvedUrl) continue

      if (seenUrls.has(resolvedUrl)) {
        console.log(`    Skipping duplicate: ${resolvedUrl.slice(0, 80)}`)
        continue
      }
      seenUrls.add(resolvedUrl)

      const filename = deriveFilename(resolvedUrl, img.alt)

      images.push({
        originalUrl: resolvedUrl,
        localPath: `images/${siteDomain(pageUrl)}/${pageName}/${sectionLabel}/${filename}`,
        alt: img.alt,
        dimensions: img.bounds,
        type: "img",
        parentClassName: img.parentClassName,
      })

      console.log(`    IMG: ${filename} (${Math.round(img.bounds.width)}x${Math.round(img.bounds.height)})`)
    }

    // Extract CSS background-image URLs
    const bgData = await handle.evaluate((el: Element) => {
      const results: {
        url: string
        bounds: { x: number; y: number; width: number; height: number }
        className: string
      }[] = []
      const allEls = Array.from(el.querySelectorAll("*"))
      for (const child of allEls) {
        const cs = window.getComputedStyle(child)
        const bgImage = cs.backgroundImage
        if (!bgImage || bgImage === "none") continue
        const match = bgImage.match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/)
        if (!match) continue
        const rect = child.getBoundingClientRect()
        if (rect.width < 5 || rect.height < 5) continue
        results.push({
          url: match[1],
          bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          className: (child as HTMLElement).className?.toString?.() || "",
        })
      }
      return results
    })

    for (const bg of bgData) {
      if (seenUrls.has(bg.url)) {
        console.log(`    Skipping duplicate bg: ${bg.url.slice(0, 80)}`)
        continue
      }
      seenUrls.add(bg.url)

      const filename = deriveFilename(bg.url, "")

      images.push({
        originalUrl: bg.url,
        localPath: `images/${siteDomain(pageUrl)}/${pageName}/${sectionLabel}/${filename}`,
        alt: "",
        dimensions: bg.bounds,
        type: "css-background",
        parentClassName: bg.className,
      })

      console.log(`    BG:  ${filename} (${Math.round(bg.bounds.width)}x${Math.round(bg.bounds.height)})`)
    }

    // Extract inline SVGs
    const svgData: {
      outerHTML: string
      alt: string
      width: number
      height: number
      parentTag: string
      parentClassName: string
      nearestHref: string
      nearestText: string
      domOrder: number
    }[] = await handle.evaluate((section: Element) => {
      const results: {
        outerHTML: string
        alt: string
        width: number
        height: number
        parentTag: string
        parentClassName: string
        nearestHref: string
        nearestText: string
        domOrder: number
      }[] = []
      const svgs = section.querySelectorAll("svg")
      for (let i = 0; i < svgs.length; i++) {
        const svg = svgs[i]
        const rect = svg.getBoundingClientRect()
        if (rect.width < 10 || rect.height < 10) continue
        const parent = svg.parentElement
        const clickable = svg.closest("a, button")
        const nearestHref = clickable instanceof HTMLAnchorElement ? clickable.href : ""
        const nearestText = clickable?.textContent?.trim().replace(/\s+/g, " ").slice(0, 160) || ""
        const alt =
          parent?.getAttribute("aria-label")
          || svg.getAttribute("aria-label")
          || nearestText
          || `inline-svg-${i}`
        results.push({
          outerHTML: svg.outerHTML,
          alt,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          parentTag: parent?.tagName?.toLowerCase?.() || "",
          parentClassName: parent?.className?.toString?.() || "",
          nearestHref,
          nearestText,
          domOrder: i,
        })
      }
      return results
    })

    for (let si = 0; si < svgData.length; si++) {
      const svg = svgData[si]
      const filename = sanitizeFilename(svg.alt || `inline-svg-${si}`) + ".svg"
      const roleHint = inferSvgRoleHint({
        alt: svg.alt,
        parentTag: svg.parentTag,
        parentClassName: svg.parentClassName,
        nearestHref: svg.nearestHref,
        nearestText: svg.nearestText,
      })

      inlineSvgs.push({
        outerHTML: svg.outerHTML,
        localPath: `images/${siteDomain(pageUrl)}/${pageName}/${sectionLabel}/${filename}`,
        alt: svg.alt,
        width: svg.width,
        height: svg.height,
        parentTag: svg.parentTag,
        parentClassName: svg.parentClassName,
        nearestHref: svg.nearestHref,
        nearestText: svg.nearestText,
        roleHint,
        domOrder: svg.domOrder,
      })

      console.log(`    SVG: ${filename} (${svg.width}x${svg.height}) [${roleHint}]`)
    }

    const shellMeta = await handle.evaluate((section: Element) => {
      const sectionTag = section.tagName.toLowerCase()
      const controls = Array.from(section.querySelectorAll("a, button"))
        .map((el) => {
          const text = el.textContent?.trim().replace(/\s+/g, " ").slice(0, 160) || ""
          const href = el instanceof HTMLAnchorElement ? el.href : ""
          const className = el.className?.toString?.() || ""
          const rect = el.getBoundingClientRect()
          const style = window.getComputedStyle(el)
          const childElements = Array.from(el.children) as HTMLElement[]
          const childWidths = childElements.map(child => Math.round(child.getBoundingClientRect().width))
          const lastChild = childElements.at(-1)
          const parent = el.parentElement
          const parentTag = parent?.tagName?.toLowerCase?.() || ""
          const parentClassName = parent?.className?.toString?.() || ""
          const haystack = [text, href, className, parentClassName].join(" ").toLowerCase()
          let roleHint: ShellControlEntry["roleHint"] = "unknown"
          if (el.tagName.toLowerCase() === "button" && /(products|industries|resources|language|english)/.test(haystack)) {
            roleHint = /(language|english)/.test(haystack) ? "language-trigger" : "nav-trigger"
          } else if (/(facebook|linkedin|youtube|instagram|twitter|x.com|x-twitter)/.test(haystack)) {
            roleHint = "social-link"
          } else if (/(log in|sign up|create a doodle|privacy settings)/.test(haystack)) {
            roleHint = "action"
          } else if (/(legal notice|sitemap|about doodle|jobs|research program|ads on doodle|affiliate)/.test(haystack)) {
            roleHint = "legal-link"
          }
          return {
            kind: (el.tagName.toLowerCase() === "button" ? "button" : "link") as "button" | "link",
            text,
            href,
            className,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            childWidths,
            lastChildHasLeftBorder: lastChild ? window.getComputedStyle(lastChild).borderLeftStyle !== "none" && window.getComputedStyle(lastChild).borderLeftWidth !== "0px" : false,
            parentTag,
            parentClassName,
            roleHint,
            backgroundColor: style.backgroundColor,
            textColor: style.color,
            border: style.border,
            borderRadius: Math.round(parseFloat(style.borderTopLeftRadius || "0")),
            paddingTop: Math.round(parseFloat(style.paddingTop || "0")),
            paddingRight: Math.round(parseFloat(style.paddingRight || "0")),
            paddingBottom: Math.round(parseFloat(style.paddingBottom || "0")),
            paddingLeft: Math.round(parseFloat(style.paddingLeft || "0")),
          }
        })
        .filter(control => control.text || control.href)

      const shellLike = section.matches("header, footer, nav")
        || section.querySelector("header, footer, nav")
        || controls.some(control => control.roleHint !== "unknown")

      const interactionMode = "unknown" as const

      return shellLike ? { sectionTag, controls, interactionMode } : null
    })

    const expandedTriggers: ExpandedShellTriggerEntry[] = shellMeta
      ? await handle.evaluate(async (section: Element) => {
          const normalizeText = (value: string) =>
            value.replace(/\s+/g, " ").trim().slice(0, 160)

          const isVisible = (el: Element) => {
            const rect = el.getBoundingClientRect()
            const style = window.getComputedStyle(el)
            return rect.width > 0
              && rect.height > 0
              && style.display !== "none"
              && style.visibility !== "hidden"
              && style.opacity !== "0"
          }

          const collectVisibleInteractiveItems = (root: ParentNode = document) => {
            return Array.from(root.querySelectorAll("a, button"))
              .filter(el => isVisible(el))
              .map((el) => ({
                  label: normalizeText(el.textContent || ""),
                  href: el instanceof HTMLAnchorElement ? el.href : "",
                  kind: (el.tagName.toLowerCase() === "button" ? "button" : "link") as "button" | "link",
                  className: el.className?.toString?.() || "",
                  width: Math.round(el.getBoundingClientRect().width),
                  height: Math.round(el.getBoundingClientRect().height),
                  backgroundColor: window.getComputedStyle(el).backgroundColor,
                  border: window.getComputedStyle(el).border,
                  borderRadius: Math.round(parseFloat(window.getComputedStyle(el).borderTopLeftRadius || "0")),
                  paddingTop: Math.round(parseFloat(window.getComputedStyle(el).paddingTop || "0")),
                  paddingRight: Math.round(parseFloat(window.getComputedStyle(el).paddingRight || "0")),
                  paddingBottom: Math.round(parseFloat(window.getComputedStyle(el).paddingBottom || "0")),
                  paddingLeft: Math.round(parseFloat(window.getComputedStyle(el).paddingLeft || "0")),
                }))
              .filter(item => item.label || item.href)
          }

          const controls = Array.from(section.querySelectorAll("a, button"))
          const candidates = controls.filter((el) => {
            const text = normalizeText(el.textContent || "")
            const className = el.className?.toString?.().toLowerCase?.() || ""
            const ariaHasPopup = el.getAttribute("aria-haspopup")
            const ariaExpanded = el.getAttribute("aria-expanded")
            const href = el instanceof HTMLAnchorElement ? el.getAttribute("href") || "" : ""
            const isExpandableControl =
              el.tagName.toLowerCase() === "button"
              || el.getAttribute("role") === "button"
              || Boolean(ariaHasPopup)
              || ariaExpanded !== null
              || href === ""
              || href === "#"
            return Boolean(
              isExpandableControl
              && (
              ariaHasPopup
              || ariaExpanded !== null
              || /(products|industries|resources|language|english|menu)/.test(`${text} ${className}`.toLowerCase())
              )
            )
          })

          const findEnclosingPanel = (trigger: Element, elements: Element[]) => {
            if (elements.length === 0) return null
            const triggerRect = trigger.getBoundingClientRect()
            const itemRects = elements.map((element) => element.getBoundingClientRect())
            const union = {
              left: Math.min(...itemRects.map(rect => rect.left)),
              top: Math.min(...itemRects.map(rect => rect.top)),
              right: Math.max(...itemRects.map(rect => rect.right)),
              bottom: Math.max(...itemRects.map(rect => rect.bottom)),
            }
            const ancestorChains = elements.map((element) => {
              const chain: Element[] = []
              let current: Element | null = element.parentElement
              while (current && current !== section) {
                chain.push(current)
                current = current.parentElement
              }
              return chain
            })
            const candidates = ancestorChains[0]?.filter((candidate) => {
              if (!ancestorChains.every(chain => chain.includes(candidate))) return false
              if (candidate === trigger || candidate === trigger.parentElement) return false
              const rect = candidate.getBoundingClientRect()
              const style = window.getComputedStyle(candidate)
              if (rect.width <= 0 || rect.height <= 0) return false
              if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false
              const containsUnion =
                rect.left <= union.left + 1
                && rect.top <= union.top + 1
                && rect.right >= union.right - 1
                && rect.bottom >= union.bottom - 1
              if (!containsUnion) return false
              const meaningfullyLarger =
                rect.width > triggerRect.width * 1.2
                || rect.height > triggerRect.height * 1.2
              return meaningfullyLarger
            }) || []
            if (candidates.length === 0) return null
            candidates.sort((a, b) => {
              const aRect = a.getBoundingClientRect()
              const bRect = b.getBoundingClientRect()
              return (aRect.width * aRect.height) - (bRect.width * bRect.height)
            })
            for (const candidate of candidates) {
              const cls = candidate.className?.toString?.().toLowerCase?.() || ""
              if (/(drawer|dropdown|menu|popover|panel|listbox)/.test(cls)) {
                return candidate
              }
            }
            return candidates[0] || null
          }

          const deriveColumnCount = (elements: Element[]) => {
            const lefts: number[] = []
            for (const element of elements) {
              const left = Math.round(element.getBoundingClientRect().left)
              if (!lefts.some(existing => Math.abs(existing - left) <= 12)) {
                lefts.push(left)
              }
            }
            return Math.max(1, lefts.length)
          }

          const deriveGap = (values: number[]) => {
            if (values.length < 2) return 0
            const sorted = [...values].sort((a, b) => a - b)
            const diffs: number[] = []
            for (let index = 1; index < sorted.length; index++) {
              const diff = sorted[index] - sorted[index - 1]
              if (diff > 1) diffs.push(diff)
            }
            if (diffs.length === 0) return 0
            return Math.round(diffs.sort((a, b) => a - b)[0])
          }

          const results: ExpandedShellTriggerEntry[] = []
          for (const trigger of candidates) {
            const triggerText = normalizeText(trigger.textContent || "")
            const baselineKeys = new Set(collectVisibleInteractiveItems(document).map(item => `${item.kind}|${item.label}|${item.href}`))
            const triggerRect = trigger.getBoundingClientRect()

            ;(trigger as HTMLElement).click()
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))

            const documentExpandedItemElements = Array.from(document.querySelectorAll("a, button"))
              .filter(el => isVisible(el))
              .filter(el => el !== trigger)
              .filter(el => {
                const item = {
                  label: normalizeText(el.textContent || ""),
                  href: el instanceof HTMLAnchorElement ? el.href : "",
                  kind: (el.tagName.toLowerCase() === "button" ? "button" : "link") as "button" | "link",
                }
                return !baselineKeys.has(`${item.kind}|${item.label}|${item.href}`)
              })
            const className = trigger.className?.toString?.().toLowerCase?.() || ""
            let roleHint: ShellControlEntry["roleHint"] = "unknown"
            if (/(products|industries|resources)/.test(`${triggerText} ${className}`.toLowerCase())) roleHint = "nav-trigger"
            else if (/(language|english)/.test(`${triggerText} ${className}`.toLowerCase())) roleHint = "language-trigger"

            if (documentExpandedItemElements.length > 0) {
              const panelRoot = findEnclosingPanel(trigger, documentExpandedItemElements)
              const expandedItemElements = panelRoot
                ? documentExpandedItemElements.filter(el => panelRoot.contains(el))
                : documentExpandedItemElements
              const expandedItems = expandedItemElements
                .map((el) => ({
                  label: normalizeText(el.textContent || ""),
                  href: el instanceof HTMLAnchorElement ? el.href : "",
                  kind: (el.tagName.toLowerCase() === "button" ? "button" : "link") as "button" | "link",
                  className: el.className?.toString?.() || "",
                  width: Math.round(el.getBoundingClientRect().width),
                  height: Math.round(el.getBoundingClientRect().height),
                  backgroundColor: window.getComputedStyle(el).backgroundColor,
                  border: window.getComputedStyle(el).border,
                  borderRadius: Math.round(parseFloat(window.getComputedStyle(el).borderTopLeftRadius || "0")),
                  paddingTop: Math.round(parseFloat(window.getComputedStyle(el).paddingTop || "0")),
                  paddingRight: Math.round(parseFloat(window.getComputedStyle(el).paddingRight || "0")),
                  paddingBottom: Math.round(parseFloat(window.getComputedStyle(el).paddingBottom || "0")),
                  paddingLeft: Math.round(parseFloat(window.getComputedStyle(el).paddingLeft || "0")),
                }))
                .filter(item => item.label || item.href)
              if (expandedItems.length === 0) {
                ;(trigger as HTMLElement).click()
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
                continue
              }
              const panelStyles = panelRoot ? window.getComputedStyle(panelRoot) : null
              const panelRect = panelRoot ? panelRoot.getBoundingClientRect() : null
              const columnCount = panelStyles?.gridTemplateColumns && panelStyles.gridTemplateColumns !== "none"
                ? panelStyles.gridTemplateColumns.split(" ").filter(Boolean).length
                : deriveColumnCount(expandedItemElements)
              const layoutMode =
                panelStyles?.display === "grid" || columnCount > 1 ? "grid"
                : expandedItemElements.length > 1 ? "list"
                : "unknown"
              const itemRects = expandedItemElements.map(element => element.getBoundingClientRect())
              const averageItemWidth = itemRects.length
                ? Math.round(itemRects.reduce((sum, rect) => sum + rect.width, 0) / itemRects.length)
                : 0
              const averageItemHeight = itemRects.length
                ? Math.round(itemRects.reduce((sum, rect) => sum + rect.height, 0) / itemRects.length)
                : 0
              const rowGap = panelStyles?.rowGap && panelStyles.rowGap !== "normal"
                ? Math.round(parseFloat(panelStyles.rowGap || "0"))
                : deriveGap(itemRects.map(rect => Math.round(rect.top)))
              const columnGap = panelStyles?.columnGap && panelStyles.columnGap !== "normal"
                ? Math.round(parseFloat(panelStyles.columnGap || "0"))
                : deriveGap(itemRects.map(rect => Math.round(rect.left)))
              results.push({
                label: triggerText,
                kind: (trigger.tagName.toLowerCase() === "button" ? "button" : "link") as "button" | "link",
                roleHint,
                interactionMode: "click",
                items: expandedItems,
                panel: panelRect && panelStyles ? {
                  width: Math.round(panelRect.width),
                  height: Math.round(panelRect.height),
                  layoutMode,
                  columnCount,
                  rowGap,
                  columnGap,
                  borderRadius: Math.round(parseFloat(panelStyles.borderTopLeftRadius || "0")),
                  offsetX: Math.round(panelRect.left - triggerRect.left),
                  offsetY: Math.round(panelRect.top - triggerRect.bottom),
                  averageItemWidth,
                  averageItemHeight,
                  containerClassName: panelRoot?.className?.toString?.() || "",
                  backgroundColor: panelStyles.backgroundColor,
                  border: panelStyles.border,
                  boxShadow: panelStyles.boxShadow,
                  paddingTop: Math.round(parseFloat(panelStyles.paddingTop || "0")),
                  paddingRight: Math.round(parseFloat(panelStyles.paddingRight || "0")),
                  paddingBottom: Math.round(parseFloat(panelStyles.paddingBottom || "0")),
                  paddingLeft: Math.round(parseFloat(panelStyles.paddingLeft || "0")),
                } : null,
              })
            }

            ;(trigger as HTMLElement).click()
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          }

          return results
        })
      : []

    if (shellMeta) {
      const wrappers: ShellWrapperEntry[] = await handle.evaluate((section: Element) => {
        const shellRoot = section.querySelector("header, footer, nav") || section
        const candidateContainers = [shellRoot, shellRoot.firstElementChild, shellRoot.firstElementChild?.firstElementChild]
          .filter((el): el is Element => Boolean(el))
        const layoutContainer = candidateContainers.find(container => container.children.length >= 3) || shellRoot
        return Array.from(layoutContainer.children)
          .map((child) => {
            const rect = child.getBoundingClientRect()
            const className = child.className?.toString?.() || ""
            const text = `${child.textContent || ""} ${className}`.toLowerCase()
            let role = "unknown"
            if (/breadcrumb/.test(text)) role = "breadcrumb"
            else if (/logo/.test(text)) role = "logo"
            else if (/social/.test(text)) role = "social"
            else if (/top-navigation/.test(text)) role = "top-navigation"
            else if (/language/.test(text)) role = "language-picker"
            else if (/(divider|separator|rule|line)/.test(text) || (rect.height <= 2 && rect.width >= 80)) role = "divider"
            else if (/bottom-navigation/.test(text)) role = "bottom-navigation"
            else if (/privacy/.test(text)) role = "privacy"
            const style = window.getComputedStyle(child)
            return {
              role,
              className,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              backgroundColor: style.backgroundColor,
              display: style.display,
              justifyContent: style.justifyContent,
              justifySelf: style.justifySelf,
              alignItems: style.alignItems,
              alignSelf: style.alignSelf,
              marginTop: Math.round(parseFloat(style.marginTop || "0")),
              marginRight: Math.round(parseFloat(style.marginRight || "0")),
              marginBottom: Math.round(parseFloat(style.marginBottom || "0")),
              marginLeft: Math.round(parseFloat(style.marginLeft || "0")),
              paddingTop: Math.round(parseFloat(style.paddingTop || "0")),
              paddingRight: Math.round(parseFloat(style.paddingRight || "0")),
              paddingBottom: Math.round(parseFloat(style.paddingBottom || "0")),
              paddingLeft: Math.round(parseFloat(style.paddingLeft || "0")),
            }
          })
          .filter(wrapper => wrapper.width > 0 || wrapper.height > 0)
      })
      shellSections.push({
        index: i,
        label: sectionLabel,
        sectionTag: shellMeta.sectionTag,
        interactionMode: shellMeta.interactionMode,
        controls: shellMeta.controls,
        inlineSvgs,
        expandedTriggers,
        wrappers,
      })
    }

    if (images.length > 0 || inlineSvgs.length > 0) {
      sections.push({ index: i, label: sectionLabel, images, inlineSvgs })
    } else {
      console.log("    (no images)")
    }
  }

  const totalImages = sections.reduce((sum, s) => sum + s.images.length + s.inlineSvgs.length, 0)

  return {
    url: page.url(),
    sections,
    shellSections,
    totalImages,
  }
}

export async function writeImageOutput(
  result: ImageExtractionResult,
  imageBaseDir: string,
  manifestDir: string
): Promise<void> {
  for (const section of result.sections) {
    for (const img of section.images) {
      const fullLocalPath = join(imageBaseDir, ...img.localPath.split("/").slice(1))
      try {
        if (!existsSync(fullLocalPath)) {
          await downloadFile(img.originalUrl, fullLocalPath)
        }
      } catch (err) {
        console.error(`    Failed to download ${img.originalUrl}: ${err}`)
      }
    }

    for (const svg of section.inlineSvgs) {
      const fullLocalPath = join(imageBaseDir, ...svg.localPath.split("/").slice(1))
      const dir = join(fullLocalPath, "..")
      mkdirSync(dir, { recursive: true })
      writeFileSync(fullLocalPath, normalizeStandaloneSvg(svg.outerHTML))
    }
  }

  mkdirSync(manifestDir, { recursive: true })
  writeFileSync(
    join(manifestDir, "image-manifest.json"),
    JSON.stringify(
      {
        url: result.url,
        extractedAt: new Date().toISOString(),
        totalImages: result.totalImages,
        sections: result.sections,
      },
      null,
      2
    )
  )

  writeFileSync(
    join(manifestDir, "shell-summary.json"),
    JSON.stringify(deriveShellSummary(result), null, 2)
  )
}
