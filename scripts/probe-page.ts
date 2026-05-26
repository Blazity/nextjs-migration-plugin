import { chromium } from "@playwright/test"
import { readFileSync, readdirSync } from "fs"
import { join, dirname, resolve } from "path"
import { fileURLToPath } from "url"
import type { PlatformAdapter } from "./lib/adapter-loader.ts"
import { detectCMP, dismissCookieBanner } from "./lib/cookie-consent.ts"
import { installNameShim } from "./lib/playwright-eval-shim.ts"
import { buildProbeRecommendation } from "./lib/probe-analysis.ts"

const TARGET_URL = process.argv[2]
if (!TARGET_URL) {
  console.error("Usage: pnpm ts scripts/probe-page.ts <url> [--expected-content <text>]")
  process.exit(1)
}

const expectedIdx = process.argv.indexOf("--expected-content")
const EXPECTED_CONTENT = expectedIdx >= 0 ? process.argv[expectedIdx + 1] : undefined
// Resolve adapters relative to script location, not CWD. The script ships
// with the plugin install; old CWD-relative adapter paths break when probe
// is invoked from a user project dir.
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ADAPTERS_DIR = resolve(SCRIPT_DIR, "../adapters")

interface DetectedPlatform {
  platform: string
  confidence: "definitive" | "high" | "medium"
  signals: string[]
  layer: 1 | 2 | 3
  adapterExists: boolean
  adapterPath: string | null
}

interface ProbeReport {
  url: string
  timestamp: string
  detectedCMP: string | null
  detectedPlatforms: Record<string, { detected: boolean; type: "framework" | "cms"; markers: string[] }>
  detectedPlatformsList: DetectedPlatform[]
  unmatchedPlatforms: string[]
  matchedAdapters: string[]
  spaAnalysis: {
    isSPA: boolean
    bodyDirectChildSections: number
    contentSections: number
  }
  contentValidation: {
    pageTitle: string
    h1Text: string
    urlPathKeywords: string[]
    contentMatchesUrl: boolean
    suspectedFallback: boolean
    fallbackSignals: string[]
  }
  recommendation: "DIRECT_EXTRACTION" | "SPA_FLOW_EXTRACTION" | "ABORT_NO_ADAPTER"
}

function loadAllAdapters(): { adapter: PlatformAdapter; path: string }[] {
  const files = readdirSync(ADAPTERS_DIR).filter(f => f.endsWith(".json") && f !== "TEMPLATE.md" && f !== "cookie-consent.json")
  return files.map(f => {
    const fullPath = join(ADAPTERS_DIR, f)
    return { adapter: JSON.parse(readFileSync(fullPath, "utf-8")) as PlatformAdapter, path: fullPath }
  })
}

function extractUrlKeywords(url: string): string[] {
  try {
    return new URL(url).pathname
      .split("/")
      .filter(Boolean)
      .flatMap(seg => seg.split(/[-_]/))
      .filter(w => w.length > 2)
  } catch {
    return []
  }
}

function contentRelatesToKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase()
  return keywords.some(kw => lower.includes(kw.toLowerCase()))
}

// Known class prefix → platform mapping for Layer 3 deep scan
const CLASS_PREFIX_PLATFORM_MAP: Record<string, string> = {
  "framer-": "framer",
  "elementor-": "wordpress-elementor",
  "et_pb_": "wordpress-divi",
  "wp-block-": "wordpress-gutenberg",
  "svelte-": "svelte",
  "sqs-": "squarespace",
  "bubble-": "bubble",
  "wixui-": "wix",
  "astro-": "astro",
  "shopify-": "shopify",
}

// Known CDN domains → platform mapping for Layer 3
const CDN_DOMAIN_PLATFORM_MAP: Record<string, string> = {
  "cdn.prod.website-files.com": "webflow",
  "assets.website-files.com": "webflow",
  "framerusercontent.com": "framer",
  "cdn.shopify.com": "shopify",
  "images.squarespace-cdn.com": "squarespace",
  "static.wixstatic.com": "wix",
  "static.parastorage.com": "wix",
  "images.ctfassets.net": "contentful",
  "images.prismic.io": "prismic",
  "cdn.sanity.io": "sanity",
}

async function main() {
  const allAdapters = loadAllAdapters()
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  // tsx injects a `__name` esbuild helper into every `page.evaluate(...)`
  // body it ships to the browser context. Without this shim the very first
  // evaluate throws `ReferenceError: __name is not defined`, the probe
  // crashes, and the worker records `matchedAdapters: []` for every URL.
  // See docs/issues/001.
  await installNameShim(context)
  const page = await context.newPage()

  // Layer 1: Capture HTTP response headers before render
  let responseHeaders: Record<string, string> = {}
  page.on("response", (response) => {
    if (response.url() === TARGET_URL && response.status() >= 200 && response.status() < 400) {
      const headers = response.headers()
      responseHeaders = { ...responseHeaders, ...headers }
    }
  })

  await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 })
  await page.waitForTimeout(2000)

  const detectedCMP = await detectCMP(page)
  if (detectedCMP) {
    console.log(`  Cookie consent: ${detectedCMP} (auto-dismiss)`)
    await dismissCookieBanner(page)
  }

  // Layer 1: Pre-render scan (HTTP headers, meta generator, script/link domains)
  const rawHtml = await page.content()
  const metaGenerator = rawHtml.match(/<meta[^>]*name=["']generator["'][^>]*content=["']([^"']+)["']/i)?.[1] || null
  const scriptDomains = [...new Set([...rawHtml.matchAll(/script[^>]*src=["'](https?:\/\/[^"'/]+)/gi)].map(m => m[1].replace(/^https?:\/\//, "")))]
  const linkDomains = [...new Set([...rawHtml.matchAll(/link[^>]*href=["'](https?:\/\/[^"'/]+)/gi)].map(m => m[1].replace(/^https?:\/\//, "")))]

  const pageHtml = await page.evaluate(() => document.documentElement.outerHTML)

  // Layered detection
  const detected: Record<string, { detected: boolean; type: "framework" | "cms"; markers: string[] }> = {}
  const matchedAdapters: string[] = []
  const detectedPlatformsList: DetectedPlatform[] = []
  const definitivelyDetected = new Set<string>()

  // Layer 1: Check meta generator and HTTP headers against adapters
  for (const { adapter, path } of allAdapters) {
    if (!adapter.detection) continue
    const layer1Signals: string[] = []

    // Check meta generator
    if (metaGenerator && adapter.detection.metaGenerator) {
      if (metaGenerator.startsWith(adapter.detection.metaGenerator)) {
        layer1Signals.push(`meta-generator:${metaGenerator}`)
      }
    }

    // Check meta generator against domMarkers (legacy pattern)
    for (const selector of adapter.detection.domMarkers ?? []) {
      if (selector.startsWith("meta[name") && selector.includes("generator") && metaGenerator) {
        const contentMatch = selector.match(/content[*^]?=["']([^"']+)["']/)?.[1]
        if (contentMatch && metaGenerator.includes(contentMatch)) {
          layer1Signals.push(`meta-generator-dom:${metaGenerator}`)
        }
      }
    }

    // Check HTTP headers
    if (adapter.detection.httpHeaders) {
      for (const [headerName, pattern] of Object.entries(adapter.detection.httpHeaders)) {
        const headerValue = responseHeaders[headerName.toLowerCase()]
        if (headerValue && new RegExp(pattern as string).test(headerValue)) {
          layer1Signals.push(`http-header:${headerName}=${headerValue}`)
        }
      }
    }

    // Check script/link domains against urlPatterns
    for (const pattern of adapter.detection.urlPatterns ?? []) {
      const regex = new RegExp(pattern)
      for (const domain of [...scriptDomains, ...linkDomains]) {
        if (regex.test(domain)) {
          layer1Signals.push(`script-domain:${domain}`)
        }
      }
    }

    if (layer1Signals.length >= 2) {
      definitivelyDetected.add(adapter.platform)
      detectedPlatformsList.push({
        platform: adapter.platform,
        confidence: "definitive",
        signals: layer1Signals,
        layer: 1,
        adapterExists: true,
        adapterPath: path,
      })
    }
  }

  // Layer 2: DOM markers and JS globals (existing detection)
  for (const { adapter, path } of allAdapters) {
    if (!adapter.detection) continue
    if (definitivelyDetected.has(adapter.platform)) continue // skip if already definitive

    const markers: string[] = []

    for (const jsExpr of adapter.detection.jsMarkers ?? []) {
      try {
        const result = await page.evaluate(jsExpr)
        if (result) markers.push(jsExpr)
      } catch {}
    }

    for (const selector of adapter.detection.domMarkers ?? []) {
      try {
        const el = await page.$(selector)
        if (el) markers.push(selector)
      } catch {}
    }

    for (const pattern of adapter.detection.urlPatterns ?? []) {
      try {
        if (new RegExp(pattern).test(pageHtml)) markers.push(pattern)
      } catch {}
    }

    const isDetected = markers.length > 0
    detected[adapter.platform] = { detected: isDetected, type: adapter.type ?? "framework", markers }
    if (isDetected) {
      matchedAdapters.push(path)
      const confidence = markers.length >= 2 ? "high" : "medium"
      detectedPlatformsList.push({
        platform: adapter.platform,
        confidence,
        signals: markers,
        layer: 2,
        adapterExists: true,
        adapterPath: path,
      })
    }
  }

  // Also add definitively detected platforms to the main detected map
  for (const dp of detectedPlatformsList.filter(p => p.layer === 1)) {
    detected[dp.platform] = { detected: true, type: allAdapters.find(a => a.adapter.platform === dp.platform)?.adapter.type ?? "framework", markers: dp.signals }
    if (dp.adapterPath && !matchedAdapters.includes(dp.adapterPath)) matchedAdapters.push(dp.adapterPath)
  }

  // Layer 3: Deep scan (class pattern analysis + CDN domain fingerprinting)
  const detectedPlatformNames = new Set(detectedPlatformsList.map(p => p.platform))

  const classPatterns = await page.evaluate(() => {
    const prefixCounts: Record<string, number> = {}
    const elements = document.querySelectorAll("*")
    const sample = Array.from(elements).slice(0, 500)
    for (const el of sample) {
      for (const cls of el.classList) {
        // Match known prefixes including underscore-prefixed ones like et_pb_
        const prefix = cls.match(/^([a-z][\w]*-)/)?.[1] || cls.match(/^(et_pb_)/)?.[1] || cls.match(/^(wp-block-)/)?.[1] || cls.match(/^(wixui-)/)?.[1]
        if (prefix && prefix.length > 2) {
          prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1
        }
      }
    }
    return prefixCounts
  })

  const cdnDomains = await page.evaluate(() => {
    const domains = new Set<string>()
    document.querySelectorAll("img[src], script[src], link[href]").forEach(el => {
      const url = el.getAttribute("src") || el.getAttribute("href") || ""
      try { domains.add(new URL(url).hostname) } catch {}
    })
    return [...domains]
  })

  // Match class prefixes to platforms
  for (const [prefix, platform] of Object.entries(CLASS_PREFIX_PLATFORM_MAP)) {
    if (detectedPlatformNames.has(platform)) continue
    const count = classPatterns[prefix] || 0
    if (count >= 5) {
      const adapterEntry = allAdapters.find(a => a.adapter.platform === platform)
      detectedPlatformsList.push({
        platform,
        confidence: "medium",
        signals: [`class-prefix:${prefix}(${count})`],
        layer: 3,
        adapterExists: !!adapterEntry,
        adapterPath: adapterEntry?.path ?? null,
      })
      if (adapterEntry && !matchedAdapters.includes(adapterEntry.path)) {
        matchedAdapters.push(adapterEntry.path)
      }
    }
  }

  // Match CDN domains to platforms
  for (const domain of cdnDomains) {
    for (const [cdnDomain, platform] of Object.entries(CDN_DOMAIN_PLATFORM_MAP)) {
      if (detectedPlatformNames.has(platform)) continue
      if (domain.endsWith(cdnDomain) || domain === cdnDomain) {
        const adapterEntry = allAdapters.find(a => a.adapter.platform === platform)
        if (!detectedPlatformsList.some(p => p.platform === platform)) {
          detectedPlatformsList.push({
            platform,
            confidence: "medium",
            signals: [`cdn-domain:${domain}`],
            layer: 3,
            adapterExists: !!adapterEntry,
            adapterPath: adapterEntry?.path ?? null,
          })
          if (adapterEntry && !matchedAdapters.includes(adapterEntry.path)) {
            matchedAdapters.push(adapterEntry.path)
          }
        }
      }
    }
  }

  // Determine unmatched platforms (detected but no adapter)
  const unmatchedPlatforms = detectedPlatformsList
    .filter(p => !p.adapterExists)
    .map(p => p.platform)

  // SPA structure analysis
  const spaInfo = await page.evaluate(() => {
    const skipTags = new Set(["SCRIPT", "NOSCRIPT", "STYLE", "LINK", "DIALOG"])
    const bodyChildren = Array.from(document.body.children).filter(
      el => !skipTags.has(el.tagName) && el.getBoundingClientRect().height > 10
    )
    return { bodyDirectChildSections: bodyChildren.length }
  })

  const hasDetectedFramework = Object.values(detected).some(
    d => d.detected && d.type === "framework" && !d.markers.some(m => m.includes("data-wf-site"))
  )
  const isSPA = hasDetectedFramework && spaInfo.bodyDirectChildSections < 4

  // Content validation
  const pageTitle = await page.title()
  const h1Text = await page.evaluate(() => document.querySelector("h1")?.textContent?.trim() || "(no h1)")
  const urlKeywords = extractUrlKeywords(TARGET_URL)
  const visibleText = await page.evaluate(() => document.body.innerText)
  const contentMatchesUrl = urlKeywords.length === 0 || contentRelatesToKeywords(visibleText, urlKeywords)
  const h1MatchesUrl = urlKeywords.length === 0 || contentRelatesToKeywords(h1Text, urlKeywords)
  const expectedContentMatched = !EXPECTED_CONTENT || visibleText.toLowerCase().includes(EXPECTED_CONTENT.toLowerCase())
  const detectedFrameworks = detectedPlatformsList
    .filter((platform) => detected[platform.platform]?.type === "framework")
    .map((platform) => platform.platform)
  const probeRecommendation = buildProbeRecommendation({
    unmatchedPlatforms,
    hasDetectedFramework,
    detectedFrameworks,
    contentMatchesUrl,
    h1MatchesUrl,
    expectedContentMatched,
  })
  const fallbackSignals = probeRecommendation.fallbackSignals.map((signal) => {
    if (signal === "url-content-mismatch") {
      return `URL path keywords [${urlKeywords.join(", ")}] not found in page content`
    }
    if (signal === "h1-url-mismatch") {
      return `h1 text "${h1Text}" does not relate to URL path keywords`
    }
    return `Expected content "${EXPECTED_CONTENT}" not found on page`
  })
  const suspectedFallback = probeRecommendation.suspectedFallback
  const recommendation = probeRecommendation.recommendation

  // Count content sections
  let contentSections = spaInfo.bodyDirectChildSections
  if (spaInfo.bodyDirectChildSections < 3) {
    contentSections = await page.evaluate(() => {
      const skipTags = new Set(["SCRIPT", "NOSCRIPT", "STYLE", "LINK", "DIALOG"])
      let best: Element | null = null
      let bestHeight = 0
      function walk(el: Element, depth: number) {
        if (depth > 5) return
        for (let i = 0; i < el.children.length; i++) {
          const child = el.children[i]
          if (skipTags.has(child.tagName)) continue
          const h = child.getBoundingClientRect().height
          let visibleKids = 0
          for (let j = 0; j < child.children.length; j++) {
            const c = child.children[j]
            if (c.getBoundingClientRect().height > 10 && !skipTags.has(c.tagName)) visibleKids++
          }
          if (h > bestHeight && visibleKids >= 2) { best = child; bestHeight = h }
          walk(child, depth + 1)
        }
      }
      walk(document.body, 0)
      if (!best) return 0
      return Array.from((best as Element).children).filter(
        c => !skipTags.has(c.tagName) && c.getBoundingClientRect().height > 10
      ).length
    })
  }

  const report: ProbeReport = {
    url: TARGET_URL,
    timestamp: new Date().toISOString(),
    detectedCMP,
    detectedPlatforms: detected,
    detectedPlatformsList,
    unmatchedPlatforms,
    matchedAdapters,
    spaAnalysis: {
      isSPA,
      bodyDirectChildSections: spaInfo.bodyDirectChildSections,
      contentSections,
    },
    contentValidation: {
      pageTitle,
      h1Text,
      urlPathKeywords: urlKeywords,
      contentMatchesUrl,
      suspectedFallback,
      fallbackSignals,
    },
    recommendation,
  }

  console.log(JSON.stringify(report, null, 2))

  await browser.close()
  process.exit(recommendation === "SPA_FLOW_EXTRACTION" ? 2 : recommendation === "ABORT_NO_ADAPTER" ? 3 : 0)
}

main().catch(err => {
  console.error("Probe failed:", err.message)
  process.exit(1)
})
