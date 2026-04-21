import assert from "node:assert/strict"
import test from "node:test"

import {
  assembleMultiViewportOutput,
  deriveSectionLabel,
  resolveSectionClassHint,
  type ViewportExtractionResult,
} from "../lib/extract-styles-core.ts"
import { resolveStructuralSectionHint } from "../lib/structure-snapshot.ts"
import { buildProbeRecommendation } from "../lib/probe-analysis.ts"

test("buildProbeRecommendation does not force SPA flow for Gatsby pages that only lack an h1", () => {
  const result = buildProbeRecommendation({
    unmatchedPlatforms: [],
    hasDetectedFramework: true,
    detectedFrameworks: ["gatsby"],
    contentMatchesUrl: true,
    h1MatchesUrl: false,
    expectedContentMatched: true,
  })

  assert.equal(result.suspectedFallback, false)
  assert.deepEqual(result.fallbackSignals, [])
  assert.equal(result.recommendation, "DIRECT_EXTRACTION")
})


test("assembleMultiViewportOutput keeps repeated labels as distinct sections", () => {
  const viewportResult: ViewportExtractionResult = {
    viewport: 1440,
    sections: [
      {
        index: 1,
        label: "Section",
        tag: "section",
        classHint: "Section",
        firstHeading: "Alpha",
        textPreview: "Alpha body",
        semanticRole: "content",
        hasVideo: false,
        hasBackgroundImage: false,
        hasInteractiveLinks: false,
        bounds: { x: 0, y: 100, width: 1440, height: 300 },
        elementTree: {
          tag: "section",
          className: "Section",
          text: "Alpha",
          role: null,
          attrs: {},
          bounds: { x: 0, y: 100, width: 1440, height: 300 },
          styles: { display: "block", color: "rgb(1, 2, 3)" },
          animations: {},
          children: [],
        },
        flatElements: new Map(),
        viewportStyles: new Map(),
      },
      {
        index: 2,
        label: "Section",
        tag: "section",
        classHint: "Section",
        firstHeading: "Beta",
        textPreview: "Beta body",
        semanticRole: "content",
        hasVideo: false,
        hasBackgroundImage: false,
        hasInteractiveLinks: false,
        bounds: { x: 0, y: 400, width: 1440, height: 300 },
        elementTree: {
          tag: "section",
          className: "Section",
          text: "Beta",
          role: null,
          attrs: {},
          bounds: { x: 0, y: 400, width: 1440, height: 300 },
          styles: { display: "block", color: "rgb(4, 5, 6)" },
          animations: {},
          children: [],
        },
        flatElements: new Map(),
        viewportStyles: new Map(),
      },
    ],
  }

  const output = assembleMultiViewportOutput([viewportResult], [1440], "https://example.com", "extract-styles", null)

  assert.equal(output.sections.length, 2)
  assert.deepEqual(output.sections.map((section) => section.index), [1, 2])
  assert.deepEqual(output.sections.map((section) => section.firstHeading), ["Alpha", "Beta"])
})

test("deriveSectionLabel falls back to the heading for capitalized generic Section wrappers", () => {
  assert.equal(
    deriveSectionLabel("Section", "section", "Bring your tools together", 0),
    "bring-your-tools-together"
  )
})

test("resolveSectionClassHint replaces generic class hints with a meaningful derived label", () => {
  assert.equal(
    resolveSectionClassHint("Section", "bring-your-tools-together"),
    "bring-your-tools-together"
  )
})

test("resolveStructuralSectionHint uses the heading when the structural class hint is generic", () => {
  assert.equal(
    resolveStructuralSectionHint("Section", "Bring your tools together", 5),
    "bring-your-tools-together"
  )
})
