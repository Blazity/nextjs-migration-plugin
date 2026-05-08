import type { Page } from "@playwright/test"
import { PNG } from "pngjs"
import pixelmatch from "pixelmatch"

export interface CaptureRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface ExpandRegionInput {
  x: number
  y: number
  width: number
  height: number
}

export interface ExpandRegionOptions {
  viewportWidth: number
  pageHeight: number
  role: "nav" | "hero" | "content" | "footer" | "unknown"
}

export interface DiffResult {
  width: number
  height: number
  mismatch: number
  ratio: number
  diff: PNG
}

export interface DiffAssessment {
  status: "PASS" | "FAIL" | "SUSPICIOUS_ZERO_DIFF"
  ratio: number
  diagnostics: string[]
}

export interface VisualSimilarityResult {
  similarity: number
  pixelDiffRatio: number
  bestOffset: { x: number; y: number }
  diagnostics: string[]
}

export interface VisualReadyOptions {
  selector?: string
  timeoutMs?: number
  stabilizationDelayMs?: number
  waitForFonts?: boolean
}

export interface VisualReadyHandle {
  restore(): Promise<void>
}

export interface AutomationAcceptanceInput {
  automationRejectCount: number
  skippedCount: number
  comparableSectionCount: number
  refSectionCount: number
  localSectionCount: number
}

export interface AutomationAcceptanceResult {
  accepted: boolean
  reasons: string[]
}

export interface OverlaySnapshot {
  tagName: string
  role: string
  ariaModal: boolean
  className: string
  id: string
  text: string
  position: string
  zIndex: number
  top: number
  left: number
  width: number
  height: number
  viewportWidth: number
  viewportHeight: number
  hasDismissControl: boolean
}

const SECTION_HINT_TOKENS = [
  "navbar",
  "footer",
  "banner",
  "hero",
] as const
const PADDING_BY_ROLE: Record<ExpandRegionOptions["role"], number> = {
  nav: 72,
  hero: 96,
  content: 48,
  footer: 72,
  unknown: 48,
}

const MIN_CAPTURE_HEIGHT = 220
const DEFAULT_MAX_DIFF_RATIO = 0.01
const FILL_R = 255
const FILL_G = 0
const FILL_B = 255
const FILL_A = 255
const DEFAULT_OVERLAY_SELECTORS = [
  '[aria-modal="true"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  'dialog',
  '[data-cookie-banner]',
  '[data-consent-banner]',
  '[data-cookie-consent]',
  '[id*="cookie" i]',
  '[class*="cookie" i]',
  '[id*="consent" i]',
  '[class*="consent" i]',
  '[id*="privacy" i]',
  '[class*="privacy" i]',
  '[id*="gdpr" i]',
  '[class*="gdpr" i]',
  '[id*="tracking" i]',
  '[class*="tracking" i]',
] as const
const OVERLAY_CANDIDATE_ATTRIBUTE = "data-visual-verify-overlay-key"
const LOCK_CLASS_PATTERN = /\b(?:modal-open|menu-open|scroll-lock(?:ed)?|lock-scroll|no-scroll|is-locked)\b/i
const LOCK_UTILITY_CLASS_PATTERN = /\boverflow-(?:hidden|clip)|overflow-[xy]-(?:hidden|clip)\b/i

interface OverlayCleanupPatch {
  target: "html" | "body"
  styles: Partial<Record<"overflow" | "overflowX" | "overflowY" | "paddingRight", string>>
}

interface OverlayDismissalResult {
  dismissedCount: number
}

export function deriveVisualSectionClassHint(tag: string, className: string): string {
  const classes = className
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  return (
    classes.find((classToken) =>
      classToken.startsWith("section_") ||
      classToken.startsWith("section-") ||
      SECTION_HINT_TOKENS.some((token) => classToken.includes(token))
    ) ||
    classes[0] ||
    tag
  )
}

function normalizeConsentMarkerSource(value: string): { normalized: string; compact: string } {
  const normalized = value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")

  return {
    normalized,
    compact: normalized.replace(/\s+/g, ""),
  }
}

function hasConsentMarker(snapshot: Pick<OverlaySnapshot, "className" | "id" | "text">): boolean {
  const source = `${snapshot.className} ${snapshot.id} ${snapshot.text}`
  const { normalized, compact } = normalizeConsentMarkerSource(source)

  if (/\b(cookies?|consent|privacy|gdpr|tracking)\b/i.test(normalized)) {
    return true
  }

  return [
    "cookiebanner",
    "cookieconsent",
    "cookiepreferences",
    "consentbanner",
    "consentpreferences",
    "privacysettings",
    "privacypreferences",
    "trackingsettings",
    "trackingpreferences",
  ].some((marker) => compact.includes(marker))
}

export function shouldDismissOverlay(snapshot: OverlaySnapshot): boolean {
  if (
    snapshot.ariaModal ||
    snapshot.tagName === "DIALOG" ||
    snapshot.role === "dialog" ||
    snapshot.role === "alertdialog"
  ) {
    return true
  }

  const hasBlockingOverlayLayout = (): boolean => {
    if (snapshot.position !== "fixed" && snapshot.position !== "sticky") {
      return false
    }

    if (snapshot.zIndex < 1000) {
      return false
    }

    const widthCoverage = snapshot.width / snapshot.viewportWidth
    const heightCoverage = snapshot.height / snapshot.viewportHeight
    const touchesTopEdge = snapshot.top <= snapshot.viewportHeight * 0.12
    const touchesBottomEdge = snapshot.top + snapshot.height >= snapshot.viewportHeight * 0.88
    const spansViewport = widthCoverage >= 0.75 && heightCoverage >= 0.35
    const bannerBar =
      widthCoverage >= 0.75 &&
      heightCoverage >= 0.12 &&
      (touchesTopEdge || touchesBottomEdge)
    const centeredModal =
      widthCoverage >= 0.45 &&
      heightCoverage >= 0.45 &&
      snapshot.top <= snapshot.viewportHeight * 0.25 &&
      snapshot.left <= snapshot.viewportWidth * 0.25

    return spansViewport || bannerBar || centeredModal
  }

  return hasConsentMarker(snapshot) && hasBlockingOverlayLayout()
}

export function expandRegion(input: ExpandRegionInput, options: ExpandRegionOptions): CaptureRegion {
  const padding = PADDING_BY_ROLE[options.role]
  const y = Math.max(0, Math.floor(input.y - padding))
  const desiredBottom = Math.max(
    Math.ceil(input.y + input.height + padding),
    y + MIN_CAPTURE_HEIGHT,
  )
  const bottom = Math.max(
    y,
    Math.min(
      options.pageHeight,
      desiredBottom,
    ),
  )

  return {
    x: 0,
    y,
    width: options.viewportWidth,
    height: bottom - y,
  }
}

function fillCanvas(png: PNG): void {
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = FILL_R
    png.data[i + 1] = FILL_G
    png.data[i + 2] = FILL_B
    png.data[i + 3] = FILL_A
  }
}

function countOverlapMismatch(refPng: PNG, localPng: PNG): number {
  const overlapWidth = Math.min(refPng.width, localPng.width)
  const overlapHeight = Math.min(refPng.height, localPng.height)

  if (overlapWidth === 0 || overlapHeight === 0) {
    return 0
  }

  const overlapRef = new PNG({ width: overlapWidth, height: overlapHeight })
  const overlapLocal = new PNG({ width: overlapWidth, height: overlapHeight })
  const overlapDiff = new PNG({ width: overlapWidth, height: overlapHeight })

  PNG.bitblt(refPng, overlapRef, 0, 0, overlapWidth, overlapHeight, 0, 0)
  PNG.bitblt(localPng, overlapLocal, 0, 0, overlapWidth, overlapHeight, 0, 0)

  return pixelmatch(
    overlapRef.data,
    overlapLocal.data,
    overlapDiff.data,
    overlapWidth,
    overlapHeight,
    { threshold: 0.1 },
  )
}

function countNonOverlapArea(refPng: PNG, localPng: PNG): number {
  const totalWidth = Math.max(refPng.width, localPng.width)
  const totalHeight = Math.max(refPng.height, localPng.height)
  const overlapWidth = Math.min(refPng.width, localPng.width)
  const overlapHeight = Math.min(refPng.height, localPng.height)

  return totalWidth * totalHeight - overlapWidth * overlapHeight
}

export function diffNormalizedPngs(refPng: PNG, localPng: PNG): DiffResult {
  const width = Math.max(refPng.width, localPng.width)
  const height = Math.max(refPng.height, localPng.height)
  const refCanvas = new PNG({ width, height })
  const localCanvas = new PNG({ width, height })
  const diff = new PNG({ width, height })

  fillCanvas(refCanvas)
  fillCanvas(localCanvas)
  PNG.bitblt(refPng, refCanvas, 0, 0, refPng.width, refPng.height, 0, 0)
  PNG.bitblt(localPng, localCanvas, 0, 0, localPng.width, localPng.height, 0, 0)

  const overlapMismatch = countOverlapMismatch(refPng, localPng)
  const nonOverlapMismatch = countNonOverlapArea(refPng, localPng)
  const mismatch = overlapMismatch + nonOverlapMismatch

  pixelmatch(refCanvas.data, localCanvas.data, diff.data, width, height, { threshold: 0.1 })

  return {
    width,
    height,
    mismatch,
    ratio: mismatch / (width * height),
    diff,
  }
}

export function assessVisualSimilarity(input: {
  refPng: PNG
  localPng: PNG
  maxOffsetPx?: number
}): VisualSimilarityResult {
  const rawDiff = diffNormalizedPngs(input.refPng, input.localPng)
  const maxOffsetPx = input.maxOffsetPx ?? 24
  let best = {
    similarity: clampUnit(1 - rawDiff.ratio),
    bestOffset: { x: 0, y: 0 },
  }

  for (let y = -maxOffsetPx; y <= maxOffsetPx; y += 1) {
    for (let x = -maxOffsetPx; x <= maxOffsetPx; x += 1) {
      const overlap = offsetOverlapSimilarity(input.refPng, input.localPng, { x, y })
      if (overlap === null) continue
      const offsetPenalty = ((Math.abs(x) / input.refPng.width) + (Math.abs(y) / input.refPng.height)) * 0.1
      const similarity = clampUnit(overlap - offsetPenalty)
      if (similarity > best.similarity) {
        best = {
          similarity,
          bestOffset: { x, y },
        }
      }
    }
  }

  return {
    similarity: best.similarity,
    pixelDiffRatio: rawDiff.ratio,
    bestOffset: best.bestOffset,
    diagnostics: [
      `pixelDiffRatio=${rawDiff.ratio}`,
      `bestOffset=${best.bestOffset.x},${best.bestOffset.y}`,
    ],
  }
}

function offsetOverlapSimilarity(
  refPng: PNG,
  localPng: PNG,
  offset: { x: number; y: number },
): number | null {
  let compared = 0
  let mismatch = 0

  for (let y = 0; y < refPng.height; y += 1) {
    const localY = y - offset.y
    if (localY < 0 || localY >= localPng.height) continue

    for (let x = 0; x < refPng.width; x += 1) {
      const localX = x - offset.x
      if (localX < 0 || localX >= localPng.width) continue

      compared += 1
      if (pixelsDiffer(refPng, localPng, x, y, localX, localY)) {
        mismatch += 1
      }
    }
  }

  if (compared === 0) return null
  return 1 - mismatch / compared
}

function pixelsDiffer(
  refPng: PNG,
  localPng: PNG,
  refX: number,
  refY: number,
  localX: number,
  localY: number,
): boolean {
  const refIndex = (refPng.width * refY + refX) << 2
  const localIndex = (localPng.width * localY + localX) << 2
  const delta =
    Math.abs(refPng.data[refIndex] - localPng.data[localIndex]) +
    Math.abs(refPng.data[refIndex + 1] - localPng.data[localIndex + 1]) +
    Math.abs(refPng.data[refIndex + 2] - localPng.data[localIndex + 2]) +
    Math.abs(refPng.data[refIndex + 3] - localPng.data[localIndex + 3])
  return delta > 30
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function assessDiffResult(input: {
  ratio: number
  refLabel: string
  localLabel: string
  refSize: { width: number; height: number }
  localSize: { width: number; height: number }
  exactZeroIsSuspicious?: boolean
  maxDiffRatio?: number
}): DiffAssessment {
  const exactZeroIsSuspicious = input.exactZeroIsSuspicious ?? true
  const maxDiffRatio = input.maxDiffRatio ?? DEFAULT_MAX_DIFF_RATIO
  const diagnostics = [
    `refLabel=${input.refLabel}`,
    `localLabel=${input.localLabel}`,
    `refSize=${input.refSize.width}x${input.refSize.height}`,
    `localSize=${input.localSize.width}x${input.localSize.height}`,
  ]

  if (input.ratio === 0 && exactZeroIsSuspicious) {
    return { status: "SUSPICIOUS_ZERO_DIFF", ratio: input.ratio, diagnostics }
  }

  return {
    status: input.ratio <= maxDiffRatio ? "PASS" : "FAIL",
    ratio: input.ratio,
    diagnostics,
  }
}

export function shouldCountDiffAsFailure(status: DiffAssessment["status"]): boolean {
  return status === "FAIL"
}

export function shouldAcceptDiffForAutomation(status: DiffAssessment["status"]): boolean {
  return status === "PASS"
}

export function assessAutomationAcceptance(
  input: AutomationAcceptanceInput,
): AutomationAcceptanceResult {
  const reasons: string[] = []

  if (input.automationRejectCount > 0) {
    reasons.push(`rejected-sections:${input.automationRejectCount}`)
  }

  if (input.skippedCount > 0) {
    reasons.push(`skipped-sections:${input.skippedCount}`)
  }

  if (input.comparableSectionCount === 0) {
    reasons.push("no-comparable-sections")
  }

  if (input.refSectionCount !== input.localSectionCount) {
    reasons.push(`section-count-mismatch:ref=${input.refSectionCount},local=${input.localSectionCount}`)
  }

  return {
    accepted: reasons.length === 0,
    reasons,
  }
}

async function dismissCommonOverlays(page: Page): Promise<OverlayDismissalResult> {
  const candidates = await page.evaluate(
    ({ selectors, attributeName }: {
      selectors: readonly string[]
      attributeName: string
    }) => {
      const seen = new Set<Element>()
      let nextIndex = 0

      return selectors.flatMap((selector) =>
        Array.from(document.querySelectorAll(selector)).flatMap((element) => {
          if (seen.has(element)) {
            return []
          }

          seen.add(element)
          const htmlElement = element as HTMLElement
          const rect = htmlElement.getBoundingClientRect()
          const style = window.getComputedStyle(htmlElement)
          const removalKey = `${attributeName}-${nextIndex++}`
          htmlElement.setAttribute(attributeName, removalKey)

          return [{
            removalKey,
            tagName: htmlElement.tagName,
            role: htmlElement.getAttribute("role") ?? "",
            ariaModal: htmlElement.getAttribute("aria-modal") === "true",
            className: `${htmlElement.className ?? ""}`,
            id: htmlElement.id ?? "",
            text: `${htmlElement.textContent ?? ""}`.trim(),
            position: style.position,
            zIndex: Number.parseInt(style.zIndex || "0", 10) || 0,
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            hasDismissControl: Array.from(
              htmlElement.querySelectorAll("button, [role='button'], a"),
            ).some((node) =>
              /\b(close|dismiss|reject|accept|agree|got it|continue)\b/i.test(
                `${node.textContent ?? ""} ${node.getAttribute("aria-label") ?? ""}`,
              ),
            ),
          }]
        }),
      )
    },
    {
      selectors: [...DEFAULT_OVERLAY_SELECTORS],
      attributeName: OVERLAY_CANDIDATE_ATTRIBUTE,
    },
  )

  const removalKeys = candidates
    .filter((candidate) => shouldDismissOverlay(candidate))
    .map((candidate) => candidate.removalKey)
  if (removalKeys.length === 0) {
    return { dismissedCount: 0 }
  }

  await page.evaluate(
    async ({ attributeName, removalKeys }: { attributeName: string; removalKeys: string[] }) => {
      const removalSet = new Set(removalKeys)
      const dismissControlPattern = /\b(close|dismiss|reject|accept|agree|got it|continue)\b/i

      for (const element of Array.from(document.querySelectorAll(`[${attributeName}]`))) {
        const htmlElement = element as HTMLElement
        const removalKey = htmlElement.getAttribute(attributeName)

        if (!removalKey) {
          continue
        }

        if (removalSet.has(removalKey)) {
          const dismissControl = Array.from(
            htmlElement.querySelectorAll<HTMLElement>("button, [role='button'], a"),
          ).find((node) =>
            dismissControlPattern.test(`${node.textContent ?? ""} ${node.getAttribute("aria-label") ?? ""}`),
          )

          if (dismissControl) {
            if (typeof dismissControl.click === "function") {
              dismissControl.click()
            }
            await new Promise<void>((resolve) => {
              const nextFrame =
                typeof requestAnimationFrame === "function"
                  ? requestAnimationFrame
                  : (callback: FrameRequestCallback) => setTimeout(callback, 0)
              nextFrame(() => nextFrame(() => resolve()))
            })
          }

          if (htmlElement.isConnected === false) {
            continue
          }

          htmlElement.remove()
          continue
        }

        htmlElement.removeAttribute(attributeName)
      }
    },
    {
      attributeName: OVERLAY_CANDIDATE_ATTRIBUTE,
      removalKeys,
    },
  )

  return {
    dismissedCount: removalKeys.length,
  }
}

async function cleanupOverlayDismissalSideEffects(
  page: Page,
  options: { allowUtilityClassUnlock: boolean },
): Promise<OverlayCleanupPatch[]> {
  return page.evaluate(({
    lockClassPatternSource,
    lockUtilityClassPatternSource,
    allowUtilityClassUnlock,
  }: {
    lockClassPatternSource: string
    lockUtilityClassPatternSource: string
    allowUtilityClassUnlock: boolean
  }) => {
    const lockClassPattern = new RegExp(lockClassPatternSource, "i")
    const lockUtilityClassPattern = new RegExp(lockUtilityClassPatternSource, "i")
    const isLockOverflowValue = (value: string): boolean => {
      const normalized = value.trim().toLowerCase()
      return normalized === "hidden" || normalized === "clip"
    }
    const hasNonZeroPaddingRight = (value: string): boolean => {
      const normalized = value.trim().toLowerCase()
      return normalized !== "" && normalized !== "0" && normalized !== "0px"
    }
    const targets = [
      { key: "html" as const, element: document.documentElement },
      { key: "body" as const, element: document.body },
    ]
    const patches: OverlayCleanupPatch[] = []

    for (const target of targets) {
      if (!target.element) {
        continue
      }

      const element = target.element as HTMLElement
      const classes = `${element.className ?? ""}`
        .trim()
        .split(/\s+/)
        .filter(Boolean)
      const hasLockClass = classes.some((className) => lockClassPattern.test(className))
      const hasLockUtilityClass = classes.some((className) => lockUtilityClassPattern.test(className))
      const hasLockedInlineOverflow =
        isLockOverflowValue(element.style.overflow) ||
        isLockOverflowValue(element.style.overflowX) ||
        isLockOverflowValue(element.style.overflowY)
      const hasInlineScrollbarCompensation = hasNonZeroPaddingRight(element.style.paddingRight)
      const shouldOverrideOverflow =
        hasLockClass ||
        hasLockedInlineOverflow ||
        (allowUtilityClassUnlock && hasLockUtilityClass && hasInlineScrollbarCompensation)
      const patch: OverlayCleanupPatch = {
        target: target.key,
        styles: {},
      }

      if (shouldOverrideOverflow) {
        patch.styles.overflow = element.style.overflow
        patch.styles.overflowX = element.style.overflowX
        patch.styles.overflowY = element.style.overflowY

        element.style.overflow = "auto"
        element.style.overflowX = "auto"
        element.style.overflowY = "auto"
      }

      if (hasInlineScrollbarCompensation && shouldOverrideOverflow) {
        patch.styles.paddingRight = element.style.paddingRight
        element.style.paddingRight = "0px"
      }

      if (Object.keys(patch.styles).length > 0) {
        patches.push(patch)
      }
    }

    return patches
  }, {
    lockClassPatternSource: LOCK_CLASS_PATTERN.source,
    lockUtilityClassPatternSource: LOCK_UTILITY_CLASS_PATTERN.source,
    allowUtilityClassUnlock: options.allowUtilityClassUnlock,
  })
}

async function restoreOverlayDismissalSideEffects(
  page: Page,
  patches: OverlayCleanupPatch[],
): Promise<void> {
  if (patches.length === 0) {
    return
  }

  await page.evaluate(({ patches }: { patches: OverlayCleanupPatch[] }) => {
    const targets = {
      html: document.documentElement,
      body: document.body,
    }

    for (const patch of patches) {
      const element = targets[patch.target] as HTMLElement | null
      if (!element) {
        continue
      }

      if (patch.styles.overflow !== undefined) {
        element.style.overflow = patch.styles.overflow
      }
      if (patch.styles.overflowX !== undefined) {
        element.style.overflowX = patch.styles.overflowX
      }
      if (patch.styles.overflowY !== undefined) {
        element.style.overflowY = patch.styles.overflowY
      }
      if (patch.styles.paddingRight !== undefined) {
        element.style.paddingRight = patch.styles.paddingRight
      }
    }
  }, { patches })
}

async function freezeDynamicContent(page: Page): Promise<void> {
  await page
    .addStyleTag({
      content: `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0s !important;
          scroll-behavior: auto !important;
        }
      `,
    })
    .catch(() => {})
}

export async function waitForVisualReady(
  page: Page,
  options: VisualReadyOptions = {},
): Promise<VisualReadyHandle> {
  const timeoutMs = options.timeoutMs ?? 15_000
  const stabilizationDelayMs = options.stabilizationDelayMs ?? 100
  let overlayCleanupPatches: OverlayCleanupPatch[] = []

  await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs })
  const overlayDismissal = await dismissCommonOverlays(page)
  if (overlayDismissal.dismissedCount > 0) {
    overlayCleanupPatches = await cleanupOverlayDismissalSideEffects(page, {
      allowUtilityClassUnlock: true,
    })
  }

  if (options.selector) {
    await page.waitForSelector(options.selector, { state: "visible", timeout: timeoutMs })
  } else {
    await page.waitForFunction(() => {
      const main = document.querySelector("main")
      const bodyText = document.body?.innerText?.trim().length ?? 0
      return Boolean(main) || bodyText > 0
    }, undefined, { timeout: timeoutMs })
  }

  await freezeDynamicContent(page)
  await page.waitForTimeout(stabilizationDelayMs)

  if (options.waitForFonts !== false) {
    await page
      .evaluate(async () => {
        const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts
        if (fonts?.ready) await fonts.ready
      })
      .catch(() => {})
  }

  return {
    restore: async () => {
      await restoreOverlayDismissalSideEffects(page, overlayCleanupPatches).catch(() => {})
      overlayCleanupPatches = []
    },
  }
}
