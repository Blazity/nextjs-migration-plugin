import assert from "node:assert/strict"
import test from "node:test"

import { PNG } from "pngjs"

import {
  assessAutomationAcceptance,
  assessDiffResult,
  deriveVisualSectionClassHint,
  diffNormalizedPngs,
  expandRegion,
  shouldAcceptDiffForAutomation,
  shouldCountDiffAsFailure,
  shouldDismissOverlay,
  waitForVisualReady,
  type CaptureRegion,
  type OverlaySnapshot,
} from "../lib/visual-verify-core.ts"

function makeSolidRgbPng(width: number, height: number, r: number, g: number, b: number): PNG {
  const png = new PNG({ width, height })

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2
      png.data[idx] = r
      png.data[idx + 1] = g
      png.data[idx + 2] = b
      png.data[idx + 3] = 255
    }
  }

  return png
}

function makeOverlaySnapshot(overrides: Partial<OverlaySnapshot>): OverlaySnapshot {
  return {
    tagName: "DIV",
    role: "",
    ariaModal: false,
    className: "",
    id: "",
    text: "",
    position: "static",
    zIndex: 0,
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    viewportWidth: 1440,
    viewportHeight: 900,
    hasDismissControl: false,
    ...overrides,
  }
}

class FakeControlElement {
  textContent: string
  ariaLabel: string
  role: string
  tagName: string

  constructor(input: { textContent?: string; ariaLabel?: string; role?: string; tagName?: string } = {}) {
    this.textContent = input.textContent ?? ""
    this.ariaLabel = input.ariaLabel ?? ""
    this.role = input.role ?? ""
    this.tagName = input.tagName ?? "BUTTON"
  }

  getAttribute(name: string): string | null {
    if (name === "aria-label") return this.ariaLabel || null
    if (name === "role") return this.role || null
    return null
  }
}

class FakeOverlayElement {
  tagName: string
  className: string
  id: string
  textContent: string
  removed = false
  private readonly attributes = new Map<string, string>()
  private readonly controls: FakeControlElement[]
  private readonly rect: { top: number; left: number; width: number; height: number }
  private readonly style: { position: string; zIndex: string }

  constructor(input: {
    tagName?: string
    className?: string
    id?: string
    textContent?: string
    role?: string
    ariaModal?: boolean
    position?: string
    zIndex?: number
    top?: number
    left?: number
    width?: number
    height?: number
    controls?: FakeControlElement[]
    extraAttributes?: Record<string, string>
  }) {
    this.tagName = input.tagName ?? "DIV"
    this.className = input.className ?? ""
    this.id = input.id ?? ""
    this.textContent = input.textContent ?? ""
    this.controls = input.controls ?? []
    this.rect = {
      top: input.top ?? 0,
      left: input.left ?? 0,
      width: input.width ?? 0,
      height: input.height ?? 0,
    }
    this.style = {
      position: input.position ?? "static",
      zIndex: `${input.zIndex ?? 0}`,
    }

    if (input.role) this.attributes.set("role", input.role)
    if (input.ariaModal) this.attributes.set("aria-modal", "true")
    for (const [name, value] of Object.entries(input.extraAttributes ?? {})) {
      this.attributes.set(name, value)
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name)
  }

  querySelectorAll(_selector: string): FakeControlElement[] {
    return this.controls
  }

  getBoundingClientRect(): { top: number; left: number; width: number; height: number } {
    return this.rect
  }

  getComputedStyle(): { position: string; zIndex: string } {
    return this.style
  }

  remove(): void {
    this.removed = true
  }
}

class FakePageRootElement {
  className: string
  style: {
    overflow: string
    overflowX: string
    overflowY: string
    paddingRight: string
  }
  computedStyle: {
    overflow: string
    overflowX: string
    overflowY: string
    paddingRight: string
  }

  constructor(input: {
    className?: string
    overflow?: string
    overflowX?: string
    overflowY?: string
    paddingRight?: string
    computedOverflow?: string
    computedOverflowX?: string
    computedOverflowY?: string
    computedPaddingRight?: string
  } = {}) {
    this.className = input.className ?? ""
    this.style = {
      overflow: input.overflow ?? "",
      overflowX: input.overflowX ?? "",
      overflowY: input.overflowY ?? "",
      paddingRight: input.paddingRight ?? "",
    }
    this.computedStyle = {
      overflow: input.computedOverflow ?? this.style.overflow,
      overflowX: input.computedOverflowX ?? this.style.overflowX,
      overflowY: input.computedOverflowY ?? this.style.overflowY,
      paddingRight: input.computedPaddingRight ?? this.style.paddingRight,
    }
  }
}

class FakeBodyElement extends FakePageRootElement {
  innerText: string

  constructor(input: {
    innerText?: string
    className?: string
    overflow?: string
    overflowX?: string
    overflowY?: string
    paddingRight?: string
    computedOverflow?: string
    computedOverflowX?: string
    computedOverflowY?: string
    computedPaddingRight?: string
  } = {}) {
    super(input)
    this.innerText = input.innerText ?? "Pixel-perfect page content"
  }
}

class FakeDocument {
  body: FakeBodyElement
  documentElement: FakePageRootElement
  fonts = { ready: Promise.resolve() }

  constructor(
    private readonly elements: FakeOverlayElement[],
    options: {
      body?: ConstructorParameters<typeof FakeBodyElement>[0]
      documentElement?: ConstructorParameters<typeof FakePageRootElement>[0]
    } = {},
  ) {
    this.body = new FakeBodyElement(options.body)
    this.documentElement = new FakePageRootElement(options.documentElement)
  }

  querySelector(selector: string): object | null {
    if (selector === "main") return {}
    if (selector === "body") return this.body
    if (selector === "html") return this.documentElement
    return null
  }

  querySelectorAll(selector: string): FakeOverlayElement[] {
    return this.elements.filter((element) => !element.removed && matchesOverlaySelector(element, selector))
  }
}

function matchesOverlaySelector(element: FakeOverlayElement, selector: string): boolean {
  const role = element.getAttribute("role") ?? ""
  const ariaModal = element.getAttribute("aria-modal") ?? ""

  switch (selector) {
    case '[aria-modal="true"]':
      return ariaModal === "true"
    case '[role="dialog"]':
      return role === "dialog"
    case '[role="alertdialog"]':
      return role === "alertdialog"
    case "dialog":
      return element.tagName === "DIALOG"
    case "[data-cookie-banner]":
      return element.getAttribute("data-cookie-banner") !== null
    case "[data-consent-banner]":
      return element.getAttribute("data-consent-banner") !== null
    case "[data-cookie-consent]":
      return element.getAttribute("data-cookie-consent") !== null
    default:
      if (/^\[[a-z0-9-]+\]$/i.test(selector)) {
        return element.getAttribute(selector.slice(1, -1)) !== null
      }
      return matchSubstringSelector(element.id, selector, "id") || matchSubstringSelector(element.className, selector, "class")
  }
}

function matchSubstringSelector(value: string, selector: string, attribute: "id" | "class"): boolean {
  const match = selector.match(new RegExp(`^\\[${attribute}\\*="([^"]+)" i\\]$`))
  return match !== null && value.toLowerCase().includes(match[1].toLowerCase())
}

async function withFakeBrowserEnvironment<T>(
  document: FakeDocument,
  callback: () => Promise<T> | T,
): Promise<T> {
  const originalDocument = globalThis.document
  const originalWindow = globalThis.window
  const originalEval = globalThis.eval
  const fakeWindow = {
    innerWidth: 1440,
    innerHeight: 900,
    getComputedStyle: (element: FakeOverlayElement | FakePageRootElement) => {
      if ("getComputedStyle" in element) {
        return element.getComputedStyle()
      }
      return element.computedStyle
    },
  }

  Object.defineProperty(globalThis, "document", { configurable: true, value: document })
  Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow })
  Object.defineProperty(globalThis, "eval", {
    configurable: true,
    value: () => {
      throw new Error("eval should not be used")
    },
  })

  try {
    return await callback()
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument })
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow })
    Object.defineProperty(globalThis, "eval", { configurable: true, value: originalEval })
  }
}

test("expandRegion forces full viewport width and padding for top-level sections", () => {
  const region = expandRegion(
    { x: 120, y: 300, width: 600, height: 180 },
    { viewportWidth: 1440, pageHeight: 5000, role: "content" },
  )

  assert.deepEqual(region, {
    x: 0,
    y: 252,
    width: 1440,
    height: 276,
  } satisfies CaptureRegion)
})

test("expandRegion uses larger vertical padding for hero sections", () => {
  const region = expandRegion(
    { x: 0, y: 100, width: 1440, height: 500 },
    { viewportWidth: 1440, pageHeight: 3000, role: "hero" },
  )

  assert.deepEqual(region, {
    x: 0,
    y: 4,
    width: 1440,
    height: 692,
  } satisfies CaptureRegion)
})

test("waitForVisualReady preserves existing root classes and restores only the inline state it overrides for overlay cleanup", async () => {
  const events: string[] = []
  const cookieBanner = new FakeOverlayElement({
    className: "cookieConsentBanner",
    id: "cookieConsentBanner",
    textContent: "We use cookies to improve your experience",
    position: "fixed",
    zIndex: 2000,
    top: 760,
    left: 0,
    width: 1440,
    height: 140,
    controls: [new FakeControlElement({ textContent: "Accept all" })],
  })
  const promoBanner = new FakeOverlayElement({
    className: "promo-banner",
    id: "spring-sale",
    textContent: "Spring sale: save on our new collection",
    position: "fixed",
    zIndex: 1500,
    top: 760,
    left: 0,
    width: 1440,
    height: 140,
  })
  const document = new FakeDocument(
    [cookieBanner, promoBanner],
    {
      body: {
        className: "modal-open scroll-lock",
        overflow: "hidden",
        overflowY: "hidden",
        paddingRight: "15px",
      },
      documentElement: {
        className: "overflow-hidden",
        overflow: "hidden",
        paddingRight: "15px",
      },
    },
  )
  const evaluatePayloads: unknown[] = []
  const page = {
    waitForLoadState: async (state: string) => {
      events.push(`load:${state}`)
    },
    evaluate: async (callback: unknown, arg?: unknown) => {
      evaluatePayloads.push(arg)
      if (arg && typeof arg === "object" && "selectors" in arg) {
        events.push("overlay-collect")
      } else if (arg && typeof arg === "object" && "removalKeys" in arg) {
        events.push("overlay-apply")
      } else {
        events.push("evaluate")
      }
      assert.equal(typeof callback, "function")
      return withFakeBrowserEnvironment(document, async () => (callback as (value?: unknown) => unknown)(arg))
    },
    waitForSelector: async (selector: string) => {
      events.push(`selector:${selector}`)
    },
    addStyleTag: async ({ content }: { content: string }) => {
      events.push("style")
      assert.match(content, /animation-duration: 0s !important/)
    },
    waitForTimeout: async (timeoutMs: number) => {
      events.push(`timeout:${timeoutMs}`)
    },
  } as never

  const readyState = await waitForVisualReady(page, {
    selector: "#main",
    stabilizationDelayMs: 0,
    waitForFonts: false,
  })

  assert.deepEqual(events, [
    "load:domcontentloaded",
    "overlay-collect",
    "overlay-apply",
    "evaluate",
    "selector:#main",
    "style",
    "timeout:0",
  ])
  assert.equal(cookieBanner.removed, true)
  assert.equal(promoBanner.removed, false)
  assert.equal(document.body.style.overflow, "auto")
  assert.equal(document.body.style.overflowY, "auto")
  assert.equal(document.body.style.paddingRight, "0px")
  assert.equal(document.body.className, "modal-open scroll-lock")
  assert.equal(document.documentElement.style.overflow, "auto")
  assert.equal(document.documentElement.style.paddingRight, "0px")
  assert.equal(document.documentElement.className, "overflow-hidden")

  const overlayPayload = evaluatePayloads[0] as { selectors?: string[]; shouldDismissOverlaySource?: string }
  assert.ok(overlayPayload.selectors?.some((selector) => selector.includes("cookie") || selector.includes("consent")))
  assert.equal("shouldDismissOverlaySource" in overlayPayload, false)

  const removalPayload = evaluatePayloads[1] as { removalKeys?: string[] }
  assert.equal(removalPayload.removalKeys?.length, 1)

  await readyState.restore()

  assert.deepEqual(events, [
    "load:domcontentloaded",
    "overlay-collect",
    "overlay-apply",
    "evaluate",
    "selector:#main",
    "style",
    "timeout:0",
    "evaluate",
  ])
  assert.equal(document.body.style.overflow, "hidden")
  assert.equal(document.body.style.overflowY, "hidden")
  assert.equal(document.body.style.paddingRight, "15px")
  assert.equal(document.body.className, "modal-open scroll-lock")
  assert.equal(document.documentElement.style.overflow, "hidden")
  assert.equal(document.documentElement.style.paddingRight, "15px")
  assert.equal(document.documentElement.className, "overflow-hidden")
})

test("shouldDismissOverlay ignores ordinary content even when its class name looks overlay-like", () => {
  const snapshot = makeOverlaySnapshot({
    className: "content-banner",
    id: "article-banner",
    text: "Featured banner inside the article body",
    position: "static",
    zIndex: 1,
    top: 320,
    left: 40,
    width: 720,
    height: 180,
  })

  assert.equal(shouldDismissOverlay(snapshot), false)
})

test("shouldDismissOverlay keeps a marketing banner-like fixed element when it lacks consent markers", () => {
  const snapshot = makeOverlaySnapshot({
    className: "promo-banner",
    id: "spring-sale",
    text: "Spring sale: save on our new collection",
    position: "fixed",
    zIndex: 1500,
    top: 760,
    left: 0,
    width: 1440,
    height: 140,
  })

  assert.equal(shouldDismissOverlay(snapshot), false)
})

test("shouldDismissOverlay removes a cookie-consent overlay candidate without dialog role when it blocks the viewport", () => {
  const snapshot = makeOverlaySnapshot({
    className: "cookie-consent-overlay",
    id: "cookie-consent",
    text: "We use cookies to improve your experience. Accept to continue.",
    position: "fixed",
    zIndex: 2000,
    top: 760,
    left: 0,
    width: 1440,
    height: 140,
  })

  assert.equal(shouldDismissOverlay(snapshot), true)
})

test("shouldDismissOverlay matches common consent marker variants after normalization", () => {
  const variants = [
    makeOverlaySnapshot({
      className: "cookieConsentBanner",
      position: "fixed",
      zIndex: 2000,
      top: 760,
      left: 0,
      width: 1440,
      height: 140,
    }),
    makeOverlaySnapshot({
      id: "privacySettings",
      position: "fixed",
      zIndex: 2000,
      top: 760,
      left: 0,
      width: 1440,
      height: 140,
    }),
    makeOverlaySnapshot({
      text: "Manage your consent preferences for analytics cookies",
      position: "fixed",
      zIndex: 2000,
      top: 760,
      left: 0,
      width: 1440,
      height: 140,
    }),
  ]

  for (const snapshot of variants) {
    assert.equal(shouldDismissOverlay(snapshot), true)
  }

  const nonConsentPreferences = makeOverlaySnapshot({
    className: "accountSettings",
    text: "Choose your reading preferences",
    position: "fixed",
    zIndex: 2000,
    top: 760,
    left: 0,
    width: 1440,
    height: 140,
  })

  assert.equal(shouldDismissOverlay(nonConsentPreferences), false)
})

test("expandRegion clamps negative height when the padded region starts below the page", () => {
  const region = expandRegion(
    { x: 0, y: 1000, width: 600, height: 180 },
    { viewportWidth: 1440, pageHeight: 900, role: "content" },
  )

  assert.deepEqual(region, {
    x: 0,
    y: 952,
    width: 1440,
    height: 0,
  } satisfies CaptureRegion)
})

test("normalized diff counts non-overlap even when padding color matches the pixels", () => {
  const ref = makeSolidRgbPng(100, 100, 255, 0, 255)
  const local = makeSolidRgbPng(100, 140, 255, 0, 255)
  const result = diffNormalizedPngs(ref, local)

  assert.equal(result.width, 100)
  assert.equal(result.height, 140)
  assert.equal(result.mismatch, 4000)
  assert.ok(result.ratio > 0.2)
})

test("exact zero diff is suspicious by default for migration verification", () => {
  const assessment = assessDiffResult({
    ratio: 0,
    refLabel: "hero",
    localLabel: "hero",
    refSize: { width: 1440, height: 640 },
    localSize: { width: 1440, height: 640 },
  })

  assert.equal(assessment.status, "SUSPICIOUS_ZERO_DIFF")
  assert.equal(shouldCountDiffAsFailure(assessment.status), false)
  assert.equal(shouldAcceptDiffForAutomation(assessment.status), false)
  assert.equal(shouldAcceptDiffForAutomation("PASS"), true)
  assert.equal(shouldCountDiffAsFailure("FAIL"), true)
})

test("diff assessment respects an explicit max diff ratio override", () => {
  const assessment = assessDiffResult({
    ratio: 0.04,
    refLabel: "hero",
    localLabel: "hero",
    refSize: { width: 1440, height: 640 },
    localSize: { width: 1440, height: 640 },
    exactZeroIsSuspicious: false,
    maxDiffRatio: 0.05,
  })

  assert.equal(assessment.status, "PASS")
  assert.equal(shouldAcceptDiffForAutomation(assessment.status), true)
})

test("waitForVisualReady preserves utility overflow classes even after dismissing an overlay", async () => {
  const cookieBanner = new FakeOverlayElement({
    className: "cookieConsentBanner",
    id: "cookieConsentBanner",
    textContent: "We use cookies to improve your experience",
    position: "fixed",
    zIndex: 2000,
    top: 760,
    left: 0,
    width: 1440,
    height: 140,
    controls: [new FakeControlElement({ textContent: "Accept all" })],
  })
  const document = new FakeDocument(
    [cookieBanner],
    {
      body: {
        className: "overflow-hidden",
        computedOverflow: "hidden",
        computedOverflowY: "hidden",
        computedPaddingRight: "15px",
      },
      documentElement: {
        className: "overflow-hidden",
        computedOverflow: "hidden",
        computedOverflowY: "hidden",
        computedPaddingRight: "15px",
      },
    },
  )
  const page = {
    waitForLoadState: async () => {},
    evaluate: async (callback: unknown, arg?: unknown) => {
      assert.equal(typeof callback, "function")
      return withFakeBrowserEnvironment(document, async () => (callback as (value?: unknown) => unknown)(arg))
    },
    waitForSelector: async () => {},
    addStyleTag: async () => {},
    waitForTimeout: async () => {},
  } as never

  const readyState = await waitForVisualReady(page, {
    selector: "#main",
    stabilizationDelayMs: 0,
    waitForFonts: false,
  })

  assert.equal(document.body.style.overflow, "")
  assert.equal(document.body.style.overflowY, "")
  assert.equal(document.body.style.paddingRight, "")
  assert.equal(document.body.className, "overflow-hidden")
  assert.equal(document.documentElement.style.overflow, "")
  assert.equal(document.documentElement.style.overflowY, "")
  assert.equal(document.documentElement.style.paddingRight, "")
  assert.equal(document.documentElement.className, "overflow-hidden")

  await readyState.restore()

  assert.equal(document.body.style.overflow, "")
  assert.equal(document.body.style.overflowY, "")
  assert.equal(document.body.style.paddingRight, "")
  assert.equal(document.body.className, "overflow-hidden")
  assert.equal(document.documentElement.style.overflow, "")
  assert.equal(document.documentElement.style.overflowY, "")
  assert.equal(document.documentElement.style.paddingRight, "")
  assert.equal(document.documentElement.className, "overflow-hidden")
})

test("waitForVisualReady preserves baseline root overflow styles when no explicit lock signal exists", async () => {
  const cookieBanner = new FakeOverlayElement({
    className: "cookieConsentBanner",
    id: "cookieConsentBanner",
    textContent: "We use cookies to improve your experience",
    position: "fixed",
    zIndex: 2000,
    top: 760,
    left: 0,
    width: 1440,
    height: 140,
    controls: [new FakeControlElement({ textContent: "Accept all" })],
  })
  const document = new FakeDocument(
    [cookieBanner],
    {
      body: {
        className: "site-shell",
        computedOverflowX: "hidden",
      },
      documentElement: {
        className: "page-root",
        computedOverflowX: "hidden",
      },
    },
  )
  const page = {
    waitForLoadState: async () => {},
    evaluate: async (callback: unknown, arg?: unknown) => {
      assert.equal(typeof callback, "function")
      return withFakeBrowserEnvironment(document, async () => (callback as (value?: unknown) => unknown)(arg))
    },
    waitForSelector: async () => {},
    addStyleTag: async () => {},
    waitForTimeout: async () => {},
  } as never

  const readyState = await waitForVisualReady(page, {
    selector: "#main",
    stabilizationDelayMs: 0,
    waitForFonts: false,
  })

  assert.equal(document.body.style.overflow, "")
  assert.equal(document.body.style.overflowX, "")
  assert.equal(document.body.style.overflowY, "")
  assert.equal(document.documentElement.style.overflow, "")
  assert.equal(document.documentElement.style.overflowX, "")
  assert.equal(document.documentElement.style.overflowY, "")

  await readyState.restore()

  assert.equal(document.body.style.overflow, "")
  assert.equal(document.body.style.overflowX, "")
  assert.equal(document.body.style.overflowY, "")
  assert.equal(document.documentElement.style.overflow, "")
  assert.equal(document.documentElement.style.overflowX, "")
  assert.equal(document.documentElement.style.overflowY, "")
})

test("waitForVisualReady preserves utility overflow classes without scrollbar compensation", async () => {
  const cookieBanner = new FakeOverlayElement({
    className: "cookieConsentBanner",
    id: "cookieConsentBanner",
    textContent: "We use cookies to improve your experience",
    position: "fixed",
    zIndex: 2000,
    top: 760,
    left: 0,
    width: 1440,
    height: 140,
    controls: [new FakeControlElement({ textContent: "Accept all" })],
  })
  const document = new FakeDocument(
    [cookieBanner],
    {
      body: {
        className: "overflow-hidden",
      },
      documentElement: {
        className: "overflow-x-hidden",
      },
    },
  )
  const page = {
    waitForLoadState: async () => {},
    evaluate: async (callback: unknown, arg?: unknown) => {
      assert.equal(typeof callback, "function")
      return withFakeBrowserEnvironment(document, async () => (callback as (value?: unknown) => unknown)(arg))
    },
    waitForSelector: async () => {},
    addStyleTag: async () => {},
    waitForTimeout: async () => {},
  } as never

  const readyState = await waitForVisualReady(page, {
    selector: "#main",
    stabilizationDelayMs: 0,
    waitForFonts: false,
  })

  assert.equal(document.body.style.overflow, "")
  assert.equal(document.body.style.overflowX, "")
  assert.equal(document.body.style.overflowY, "")
  assert.equal(document.documentElement.style.overflow, "")
  assert.equal(document.documentElement.style.overflowX, "")
  assert.equal(document.documentElement.style.overflowY, "")

  await readyState.restore()

  assert.equal(document.body.style.overflow, "")
  assert.equal(document.body.style.overflowX, "")
  assert.equal(document.body.style.overflowY, "")
  assert.equal(document.documentElement.style.overflow, "")
  assert.equal(document.documentElement.style.overflowX, "")
  assert.equal(document.documentElement.style.overflowY, "")
})

test("waitForVisualReady unlocks compensated utility overflow classes after dismiss-control overlays", async () => {
  const cookieBanner = new FakeOverlayElement({
    className: "cookieConsentBanner",
    id: "cookieConsentBanner",
    textContent: "We use cookies to improve your experience",
    position: "fixed",
    zIndex: 2000,
    top: 760,
    left: 0,
    width: 1440,
    height: 140,
    controls: [new FakeControlElement({ textContent: "Accept all" })],
  })
  const document = new FakeDocument(
    [cookieBanner],
    {
      body: {
        className: "overflow-hidden",
        paddingRight: "15px",
      },
      documentElement: {
        className: "overflow-x-hidden",
        paddingRight: "15px",
      },
    },
  )
  const page = {
    waitForLoadState: async () => {},
    evaluate: async (callback: unknown, arg?: unknown) => {
      assert.equal(typeof callback, "function")
      return withFakeBrowserEnvironment(document, async () => (callback as (value?: unknown) => unknown)(arg))
    },
    waitForSelector: async () => {},
    addStyleTag: async () => {},
    waitForTimeout: async () => {},
  } as never

  const readyState = await waitForVisualReady(page, {
    selector: "#main",
    stabilizationDelayMs: 0,
    waitForFonts: false,
  })

  assert.equal(document.body.style.overflow, "auto")
  assert.equal(document.body.style.paddingRight, "0px")
  assert.equal(document.documentElement.style.overflow, "auto")
  assert.equal(document.documentElement.style.paddingRight, "0px")

  await readyState.restore()

  assert.equal(document.body.style.overflow, "")
  assert.equal(document.body.style.paddingRight, "15px")
  assert.equal(document.documentElement.style.overflow, "")
  assert.equal(document.documentElement.style.paddingRight, "15px")
})

test("waitForVisualReady unlocks compensated utility overflow classes after fallback overlay removal", async () => {
  const cookieBanner = new FakeOverlayElement({
    className: "cookieConsentBanner",
    id: "cookieConsentBanner",
    textContent: "We use cookies to improve your experience",
    position: "fixed",
    zIndex: 2000,
    top: 760,
    left: 0,
    width: 1440,
    height: 140,
  })
  const document = new FakeDocument(
    [cookieBanner],
    {
      body: {
        className: "overflow-hidden",
        paddingRight: "15px",
      },
      documentElement: {
        className: "overflow-x-hidden",
        paddingRight: "15px",
      },
    },
  )
  const page = {
    waitForLoadState: async () => {},
    evaluate: async (callback: unknown, arg?: unknown) => {
      assert.equal(typeof callback, "function")
      return withFakeBrowserEnvironment(document, async () => (callback as (value?: unknown) => unknown)(arg))
    },
    waitForSelector: async () => {},
    addStyleTag: async () => {},
    waitForTimeout: async () => {},
  } as never

  const readyState = await waitForVisualReady(page, {
    selector: "#main",
    stabilizationDelayMs: 0,
    waitForFonts: false,
  })

  assert.equal(document.body.style.overflow, "auto")
  assert.equal(document.body.style.paddingRight, "0px")
  assert.equal(document.documentElement.style.overflow, "auto")
  assert.equal(document.documentElement.style.paddingRight, "0px")

  await readyState.restore()

  assert.equal(document.body.style.overflow, "")
  assert.equal(document.body.style.paddingRight, "15px")
  assert.equal(document.documentElement.style.overflow, "")
  assert.equal(document.documentElement.style.paddingRight, "15px")
})


test("automation acceptance rejects skipped sections zero comparable sections and section-count mismatch", () => {
  assert.deepEqual(
    assessAutomationAcceptance({
      automationRejectCount: 0,
      skippedCount: 1,
      comparableSectionCount: 3,
      refSectionCount: 3,
      localSectionCount: 3,
    }),
    {
      accepted: false,
      reasons: ["skipped-sections:1"],
    },
  )

  assert.deepEqual(
    assessAutomationAcceptance({
      automationRejectCount: 0,
      skippedCount: 0,
      comparableSectionCount: 0,
      refSectionCount: 3,
      localSectionCount: 3,
    }),
    {
      accepted: false,
      reasons: ["no-comparable-sections"],
    },
  )

  assert.deepEqual(
    assessAutomationAcceptance({
      automationRejectCount: 0,
      skippedCount: 0,
      comparableSectionCount: 3,
      refSectionCount: 4,
      localSectionCount: 3,
    }),
    {
      accepted: false,
      reasons: ["section-count-mismatch:ref=4,local=3"],
    },
  )

  assert.deepEqual(
    assessAutomationAcceptance({
      automationRejectCount: 0,
      skippedCount: 0,
      comparableSectionCount: 3,
      refSectionCount: 3,
      localSectionCount: 3,
    }),
    {
      accepted: true,
      reasons: [],
    },
  )
})

test("deriveVisualSectionClassHint keeps common hero class names reachable for role detection", () => {
  assert.equal(deriveVisualSectionClassHint("section", "page-shell landing-hero wrapper"), "landing-hero")
  assert.equal(deriveVisualSectionClassHint("div", "layout hero-banner section-shell"), "hero-banner")
  assert.equal(deriveVisualSectionClassHint("section", "section_feature content"), "section_feature")
})
