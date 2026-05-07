import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { Page } from "@playwright/test"

interface CookieDismiss {
  jsApi: string | null
  selector: string | null
  iframeSelector?: string
  fallbackText: string | null
}

interface CookieProvider {
  name: string
  detect: string | null
  scriptPattern: string
  jsGlobal: string | null
  dismiss: CookieDismiss
  skipSelectors: string[]
}

interface CookieConsentDB {
  version: number
  providers: CookieProvider[]
  genericFallback: {
    dismiss: { fallbackText: string }
    skipSelectors: string[]
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url))
// Plugin layout: scripts/lib/ → ../../adapters/.
const DB_PATH = join(__dirname, "../../adapters/cookie-consent.json")

let cached: CookieConsentDB | null = null

function loadDB(): CookieConsentDB {
  if (cached) return cached
  cached = JSON.parse(readFileSync(DB_PATH, "utf-8")) as CookieConsentDB
  return cached
}

export function getAllCookieSkipSelectors(): string[] {
  const db = loadDB()
  const selectors: string[] = []
  for (const provider of db.providers) {
    selectors.push(...provider.skipSelectors)
  }
  selectors.push(...db.genericFallback.skipSelectors)
  return selectors
}

export async function detectCMP(page: Page): Promise<string | null> {
  const db = loadDB()

  // 1. Script src patterns
  const scriptSrcs = await page
    .evaluate(() =>
      Array.from(document.querySelectorAll("script[src]")).map(
        (s) => (s as HTMLScriptElement).src
      )
    )
    .catch(() => [] as string[])

  for (const provider of db.providers) {
    if (!provider.scriptPattern) continue
    const re = new RegExp(provider.scriptPattern, "i")
    if (scriptSrcs.some((src) => re.test(src))) return provider.name
  }

  // 2. DOM selectors
  for (const provider of db.providers) {
    if (!provider.detect) continue
    const el = await page.$(provider.detect).catch(() => null)
    if (el) return provider.name
  }

  // 3. JS global objects
  for (const provider of db.providers) {
    if (!provider.jsGlobal) continue
    const exists = await page
      .evaluate((g) => typeof (window as unknown as Record<string, unknown>)[g] !== "undefined", provider.jsGlobal)
      .catch(() => false)
    if (exists) return provider.name
  }

  return null
}

async function anyVisible(page: Page, selectors: string[]): Promise<boolean> {
  for (const selector of selectors) {
    if (!selector) continue
    const visible = await page
      .locator(selector)
      .first()
      .isVisible()
      .catch(() => false)
    if (visible) return true
  }
  return false
}

async function providerStillVisible(page: Page, provider: CookieProvider): Promise<boolean> {
  const selectors = [
    provider.detect,
    ...provider.skipSelectors,
  ].filter((selector): selector is string => Boolean(selector))

  if (selectors.length === 0) return false
  return anyVisible(page, selectors)
}

export async function dismissCookieBanner(page: Page): Promise<string | null> {
  const db = loadDB()
  let detected = await detectCMP(page)

  // Many CMPs are dynamically injected via JS (e.g., OneTrust on Gatsby sites).
  // At domcontentloaded the script tag may not exist yet. Retry up to 3s.
  if (!detected) {
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(500)
      detected = await detectCMP(page)
      if (detected) break
    }
  }

  if (detected) {
    const provider = db.providers.find((p) => p.name === detected)!

    // 1. JS API
    if (provider.dismiss.jsApi) {
      await page.evaluate(provider.dismiss.jsApi).catch(() => {})
      await page.waitForTimeout(500)
      if (!(await providerStillVisible(page, provider))) {
        return detected
      }
    }

    // 2. Selector click (with iframe support for Sourcepoint-style providers)
    if (provider.dismiss.selector) {
      if (provider.dismiss.iframeSelector) {
        const iframeEl = await page.$(provider.dismiss.selector).catch(() => null)
        if (iframeEl) {
          const frame = await iframeEl.contentFrame().catch(() => null)
          if (frame) {
            await frame.click(provider.dismiss.iframeSelector).catch(() => {})
            await page.waitForTimeout(500)
            if (!(await providerStillVisible(page, provider))) {
              return detected
            }
          }
        }
      } else {
        await page.click(provider.dismiss.selector).catch(() => {})
        await page.waitForTimeout(500)
        if (!(await providerStillVisible(page, provider))) {
          return detected
        }
      }
    }
  }

  // Generic fallback: text-based button search
  const fallbackText = db.genericFallback.dismiss.fallbackText
  const patterns = fallbackText.split("|").map((t) => t.trim().toLowerCase())

  const clicked = await page
    .evaluate((ptns) => {
      const candidates = document.querySelectorAll("button, a, [role='button']")
      for (const el of candidates) {
        const text = (el as HTMLElement).textContent?.trim().toLowerCase()
        if (text && ptns.includes(text)) {
          ;(el as HTMLElement).click()
          return true
        }
      }
      return false
    }, patterns)
    .catch(() => false)

  if (clicked) {
    await page.waitForTimeout(500)
  }

  return detected
}
