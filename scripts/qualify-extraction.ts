import { chromium } from "@playwright/test"
import { readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { loadAdaptersFromArgs } from "./lib/adapter-loader.ts"
import { dismissCookies } from "./lib/freeze.ts"
import { snapshotStructuralSections, type StructuralSection } from "./lib/structure-snapshot.ts"
import {
  summarizeExtractionCoverage,
  type GuardrailSection,
} from "./lib/phase-guardrails.ts"

const args = process.argv.slice(2)
const referenceUrl = args[0]
const specsDir = args[1]
const adapter = loadAdaptersFromArgs()
const freezeOpts = adapter ? { localSite: adapter.localSite } : undefined

function usage(): never {
  console.error("Usage: qualify-extraction <reference-url> <specs-dir> [--adapter ...]")
  process.exit(1)
}

function toGuardrailSection(section: {
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
}): GuardrailSection {
  return {
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
  }
}

function loadManifestSections(path: string): GuardrailSection[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
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

  return raw.sections.map(toGuardrailSection)
}

function loadReferenceSections(sections: StructuralSection[]): GuardrailSection[] {
  return sections.map((section) => ({
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
  }))
}

async function main() {
  if (!referenceUrl || !specsDir || args.includes("--help") || args.includes("-h")) usage()

  const manifestPath = join(specsDir, "manifest.json")
  const qualificationPath = join(specsDir, "qualification.json")
  const manifestSections = loadManifestSections(manifestPath)
  let failed = false

  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()

    await page.goto(referenceUrl, { waitUntil: "domcontentloaded", timeout: 5000 })
    await dismissCookies(page, freezeOpts)
    await page.waitForTimeout(1000)

    const referenceSections = loadReferenceSections(
      await snapshotStructuralSections(page, {
        adapter: adapter?.sectionDiscovery,
        quiet: true,
      })
    )
    const coverage = summarizeExtractionCoverage(referenceSections, manifestSections)
    const qualification = {
      referenceUrl,
      passed: coverage.passed,
      missingRequiredRoles: coverage.missingRequiredRoles,
      genericLabels: coverage.genericLabels,
      missingVisibleRoles: coverage.missingVisibleRoles,
      extraVisibleRoles: coverage.extraVisibleRoles,
      roleSequenceMismatch: coverage.roleSequenceMismatch,
    }

    writeFileSync(qualificationPath, `${JSON.stringify(qualification, null, 2)}\n`)

    if (!coverage.passed) {
      console.log(JSON.stringify(qualification, null, 2))
      failed = true
    }
  } finally {
    await browser.close().catch(() => {})
  }

  if (failed) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
