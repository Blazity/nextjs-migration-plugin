import { chromium } from "@playwright/test"
import { readFileSync } from "fs"
import { join } from "path"
import { loadAdaptersFromArgs } from "./lib/adapter-loader.ts"
import { dismissCookies } from "./lib/freeze.ts"
import { summarizeBuildBaseline, type GuardrailSection } from "./lib/phase-guardrails.ts"
import { snapshotStructuralSections, type StructuralSection } from "./lib/structure-snapshot.ts"
import { resolveLocalSiteAdapter } from "./lib/local-site-adapter.ts"

const args = process.argv.slice(2)
const referenceUrl = args[0]
const localUrl = args[1]
const specsDir = args[2]
const adapter = loadAdaptersFromArgs()
const localAdapter = resolveLocalSiteAdapter()
const freezeOpts = adapter ? { localSite: adapter.localSite } : undefined

function usage(): never {
  console.error(
    "Usage: pnpm verify-build-baseline <reference-url> <local-url> <specs-dir> [--adapter ...]"
  )
  process.exit(1)
}

function toGuardrailSection(section: StructuralSection): GuardrailSection {
  return {
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
  }
}

function loadManifestSections(path: string): GuardrailSection[] {
  const raw = JSON.parse(
    readFileSync(path, "utf8")
  ) as {
    sections?: Array<{
      index: number
      label: string
      tag: string
      classHint: string
      firstHeading: string
      textPreview?: string
      semanticRole: GuardrailSection["semanticRole"]
      hasVideo: boolean
      hasBackgroundImage: boolean
      hasInteractiveLinks: boolean
      bounds: GuardrailSection["bounds"]
    }>
  }

  if (!Array.isArray(raw.sections)) {
    throw new Error(`No manifest sections found in ${path}`)
  }

  return raw.sections.map((section) => ({
    index: section.index,
    label: section.label,
    tag: section.tag,
    classHint: section.classHint,
    firstHeading: section.firstHeading,
    textPreview: section.textPreview ?? "",
    semanticRole: section.semanticRole,
    hasVideo: section.hasVideo,
    hasBackgroundImage: section.hasBackgroundImage,
    hasInteractiveLinks: section.hasInteractiveLinks,
    bounds: section.bounds,
  }))
}

async function snapshotPage(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  url: string,
  options?: Parameters<typeof snapshotStructuralSections>[1]
) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  try {
    const page = await context.newPage()
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
    await dismissCookies(page, freezeOpts)
    await page.waitForTimeout(1000)
    const sections = await snapshotStructuralSections(page, options)
    await page.close()
    return sections.map(toGuardrailSection)
  } finally {
    await context.close().catch(() => {})
  }
}

async function main() {
  if (!referenceUrl || !localUrl || !specsDir || args.includes("--help") || args.includes("-h")) {
    usage()
  }

  const browser = await chromium.launch()
  try {
    const manifestSections = loadManifestSections(join(specsDir, "manifest.json"))
    const referenceSections = await snapshotPage(browser, referenceUrl, {
      adapter: adapter?.sectionDiscovery,
      quiet: true,
    })
    const localSections = await snapshotPage(browser, localUrl, {
      adapter: localAdapter.sectionDiscovery,
      customSelector: localAdapter.localSite.sectionSelector,
      quiet: true,
    })
    const result = summarizeBuildBaseline({
      manifest: manifestSections,
      reference: referenceSections,
      local: localSections,
    })

    if (!result.passed) {
      const {
        manifestSignatureMismatch,
        referenceSignatureMismatch,
        ...baselineResult
      } = result
      console.error(
        JSON.stringify(
          {
            referenceUrl,
            localUrl,
            manifestSectionCount: manifestSections.length,
            referenceSectionCount: referenceSections.length,
            localSectionCount: localSections.length,
            manifestSignatureMismatch,
            referenceSignatureMismatch,
            ...baselineResult,
          },
          null,
          2
        )
      )
      process.exitCode = 1
    }
  } finally {
    await browser.close().catch(() => {})
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
