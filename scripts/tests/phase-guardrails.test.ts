import assert from "node:assert/strict"
import test from "node:test"

import {
  deriveSemanticRole,
  summarizeBuildBaseline,
  summarizeExtractionCoverage,
  type GuardrailSection,
} from "../lib/phase-guardrails.ts"

test("deriveSemanticRole classifies terminal footer-like sections", () => {
  assert.equal(
    deriveSemanticRole({
      tag: "footer",
      classHint: "footer-shell",
      firstHeading: "",
      textPreview: "About Careers Security",
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    }),
    "footer"
  )
})

test("deriveSemanticRole classifies nav-like headers as nav", () => {
  assert.equal(
    deriveSemanticRole({
      tag: "header",
      classHint: "site-navigation",
      firstHeading: "",
      textPreview: "Menu About Contact",
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    }),
    "nav"
  )
})

test("deriveSemanticRole classifies banner-style hero sections", () => {
  assert.equal(
    deriveSemanticRole({
      tag: "section",
      classHint: "banner-shell",
      firstHeading: "Build better pages",
      textPreview: "Fast launch with a clear call to action",
      hasVideo: false,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    }),
    "hero"
  )
})

test("deriveSemanticRole classifies neutral hero sections with heading media and CTA", () => {
  assert.equal(
    deriveSemanticRole({
      tag: "section",
      classHint: "feature-shell",
      firstHeading: "Launch faster",
      textPreview: "Fast rollout with a clear call to action",
      hasVideo: false,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    }),
    "hero"
  )
})

test("deriveSemanticRole classifies hero-like headers as hero", () => {
  assert.equal(
    deriveSemanticRole({
      tag: "header",
      classHint: "hero-banner",
      firstHeading: "Build faster",
      textPreview: "Launch pages with a stronger first impression",
      hasVideo: false,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    }),
    "hero"
  )
})

test("deriveSemanticRole classifies heading plus background hero without CTA as hero", () => {
  assert.equal(
    deriveSemanticRole({
      tag: "section",
      classHint: "wrapper",
      firstHeading: "Make every launch count",
      textPreview: "A focused story block with a full-bleed background image",
      hasVideo: false,
      hasBackgroundImage: true,
      hasInteractiveLinks: false,
    }),
    "hero"
  )
})

test("deriveSemanticRole returns unknown for a generic weak wrapper", () => {
  assert.equal(
    deriveSemanticRole({
      tag: "section",
      classHint: "wrapper",
      firstHeading: "",
      textPreview: "Intro text without structure",
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: false,
    }),
    "unknown"
  )
})

test("deriveSemanticRole returns unknown for common wrapper utility shells", () => {
  assert.equal(
    deriveSemanticRole({
      tag: "div",
      classHint: "padding-global",
      firstHeading: "",
      textPreview: "Nested layout shell only",
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: false,
    }),
    "unknown"
  )
})

test("deriveSemanticRole keeps a video section non-hero without stronger signals", () => {
  assert.notEqual(
    deriveSemanticRole({
      tag: "section",
      classHint: "media-block",
      firstHeading: "",
      textPreview: "Embedded clip with no extra signals",
      hasVideo: true,
      hasBackgroundImage: false,
      hasInteractiveLinks: false,
    }),
    "hero"
  )
})

test("summarizeExtractionCoverage rejects a manifest that is missing a visible footer", () => {
  const reference: GuardrailSection[] = [
    {
      index: 0,
      label: "navbar",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero",
      firstHeading: "Meet your partner in time",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "footer-shell",
      semanticRole: "footer",
      classHint: "footer-shell",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const manifest = reference.slice(0, 2)
  const result = summarizeExtractionCoverage(reference, manifest)

  assert.equal(result.passed, false)
  assert.deepEqual(result.missingRequiredRoles, ["footer"])
})

test("summarizeExtractionCoverage rejects a manifest that is missing visible content", () => {
  const reference: GuardrailSection[] = [
    {
      index: 0,
      label: "navbar",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero",
      firstHeading: "Meet your partner in time",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "content",
      semanticRole: "content",
      classHint: "content",
      firstHeading: "How it works",
      tag: "section",
      bounds: { x: 0, y: 1008, width: 1440, height: 840 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 3,
      label: "footer-shell",
      semanticRole: "footer",
      classHint: "footer-shell",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const manifest = reference.filter((section) => section.semanticRole !== "content")
  const result = summarizeExtractionCoverage(reference, manifest)

  assert.equal(result.passed, false)
})

test("summarizeExtractionCoverage rejects a manifest that invents extra content", () => {
  const reference: GuardrailSection[] = [
    {
      index: 0,
      label: "navbar",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero",
      firstHeading: "Meet your partner in time",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "content",
      semanticRole: "content",
      classHint: "content",
      firstHeading: "How it works",
      tag: "section",
      bounds: { x: 0, y: 1008, width: 1440, height: 840 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 3,
      label: "footer-shell",
      semanticRole: "footer",
      classHint: "footer-shell",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const manifest: GuardrailSection[] = [
    ...reference,
    {
      index: 4,
      label: "promo",
      semanticRole: "content",
      classHint: "promo",
      firstHeading: "Extra offer",
      tag: "section",
      bounds: { x: 0, y: 4680, width: 1440, height: 360 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const result = summarizeExtractionCoverage(reference, manifest)

  assert.equal(result.passed, false)
})

test("summarizeExtractionCoverage passes when ordered semantic roles match despite naming differences", () => {
  const reference: GuardrailSection[] = [
    {
      index: 0,
      label: "nav",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero",
      firstHeading: "Meet your partner in time",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "content",
      semanticRole: "content",
      classHint: "content",
      firstHeading: "How it works",
      tag: "section",
      bounds: { x: 0, y: 1008, width: 1440, height: 840 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 3,
      label: "footer",
      semanticRole: "footer",
      classHint: "footer-shell",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const manifest: GuardrailSection[] = [
    {
      index: 0,
      label: "top-bar",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "header",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "intro",
      semanticRole: "hero",
      classHint: "landing-hero",
      firstHeading: "Meet your partner in time",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "story",
      semanticRole: "content",
      classHint: "story-grid",
      firstHeading: "How it works",
      tag: "section",
      bounds: { x: 0, y: 1008, width: 1440, height: 840 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 3,
      label: "endcap",
      semanticRole: "footer",
      classHint: "footer-shell",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const result = summarizeExtractionCoverage(reference, manifest)

  assert.equal(result.passed, true)
})

test("summarizeExtractionCoverage ignores unknown wrappers when meaningful roles match", () => {
  const reference: GuardrailSection[] = [
    {
      index: 0,
      label: "navbar",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "wrapper",
      semanticRole: "unknown",
      classHint: "wrapper",
      firstHeading: "",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 240 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: false,
    },
    {
      index: 2,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero",
      firstHeading: "Meet your partner in time",
      tag: "section",
      bounds: { x: 0, y: 328, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 3,
      label: "content",
      semanticRole: "content",
      classHint: "content",
      firstHeading: "How it works",
      tag: "section",
      bounds: { x: 0, y: 1248, width: 1440, height: 840 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 4,
      label: "footer-shell",
      semanticRole: "footer",
      classHint: "footer-shell",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const manifest: GuardrailSection[] = [
    reference[0],
    reference[2],
    reference[3],
    reference[4],
  ]

  const result = summarizeExtractionCoverage(reference, manifest)

  assert.equal(result.passed, true)
})

test("summarizeExtractionCoverage rejects generic labels even when roles match", () => {
  const reference: GuardrailSection[] = [
    {
      index: 0,
      label: "navbar",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero",
      firstHeading: "Meet your partner in time",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "content",
      semanticRole: "content",
      classHint: "content",
      firstHeading: "How it works",
      tag: "section",
      bounds: { x: 0, y: 1008, width: 1440, height: 840 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 3,
      label: "footer-shell",
      semanticRole: "footer",
      classHint: "footer-shell",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const manifest: GuardrailSection[] = [
    {
      index: 0,
      label: "page-wrapper",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "header",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "intro",
      semanticRole: "hero",
      classHint: "landing-hero",
      firstHeading: "Meet your partner in time",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "story",
      semanticRole: "content",
      classHint: "story-grid",
      firstHeading: "How it works",
      tag: "section",
      bounds: { x: 0, y: 1008, width: 1440, height: 840 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 3,
      label: "endcap",
      semanticRole: "footer",
      classHint: "footer-shell",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const result = summarizeExtractionCoverage(reference, manifest)

  assert.equal(result.passed, false)
  assert.deepEqual(result.genericLabels, ["page-wrapper"])
  assert.equal(result.missingVisibleRoles, false)
  assert.equal(result.extraVisibleRoles, false)
  assert.equal(result.roleSequenceMismatch, false)
})

test("summarizeExtractionCoverage rejects a heading-derived label when the classHint is generic", () => {
  const reference: GuardrailSection[] = [
    {
      index: 0,
      label: "navbar",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero",
      firstHeading: "Meet your partner in time",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "content",
      semanticRole: "content",
      classHint: "content",
      firstHeading: "How it works",
      tag: "section",
      bounds: { x: 0, y: 1008, width: 1440, height: 840 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 3,
      label: "footer-shell",
      semanticRole: "footer",
      classHint: "footer-shell",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const manifest: GuardrailSection[] = [
    {
      index: 0,
      label: "nav",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "header",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "our-story",
      semanticRole: "hero",
      classHint: "section",
      firstHeading: "Our story",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "endcap",
      semanticRole: "footer",
      classHint: "footer-shell",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const result = summarizeExtractionCoverage(reference, manifest)

  assert.equal(result.passed, false)
  assert.deepEqual(result.genericLabels, ["section"])
})

test("summarizeExtractionCoverage allows complete nav-hero-footer coverage", () => {
  const reference: GuardrailSection[] = [
    {
      index: 0,
      label: "navbar",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero",
      firstHeading: "Meet your partner in time",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "footer-shell",
      semanticRole: "footer",
      classHint: "footer-shell",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const manifest: GuardrailSection[] = [
    {
      index: 0,
      label: "nav",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "header",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "intro",
      semanticRole: "hero",
      classHint: "landing-hero",
      firstHeading: "Meet your partner in time",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "endcap",
      semanticRole: "footer",
      classHint: "footer-shell",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const result = summarizeExtractionCoverage(reference, manifest)

  assert.equal(result.passed, true)
  assert.deepEqual(result.missingRequiredRoles, [])
  assert.deepEqual(result.genericLabels, [])
})

test("summarizeExtractionCoverage rejects same-role content sections that are swapped", () => {
  const reference: GuardrailSection[] = [
    {
      index: 0,
      label: "navbar",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero",
      firstHeading: "Meet your partner in time",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "content-a",
      semanticRole: "content",
      classHint: "content-a",
      firstHeading: "How it works",
      tag: "section",
      bounds: { x: 0, y: 1008, width: 1440, height: 840 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 3,
      label: "content-b",
      semanticRole: "content",
      classHint: "content-b",
      firstHeading: "Why teams choose us",
      tag: "section",
      bounds: { x: 0, y: 1848, width: 1440, height: 720 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 4,
      label: "footer-shell",
      semanticRole: "footer",
      classHint: "footer-shell",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const manifest: GuardrailSection[] = [
    reference[0],
    reference[1],
    reference[3],
    reference[2],
    reference[4],
  ]

  const result = summarizeExtractionCoverage(reference, manifest)

  assert.equal(result.passed, false)
  assert.equal(result.roleSequenceMismatch, true)
})

test("summarizeExtractionCoverage rejects same-role duplication that omits a distinct section", () => {
  const reference: GuardrailSection[] = [
    {
      index: 0,
      label: "navbar",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero",
      firstHeading: "Meet your partner in time",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "content-a",
      semanticRole: "content",
      classHint: "content-a",
      firstHeading: "How it works",
      tag: "section",
      bounds: { x: 0, y: 1008, width: 1440, height: 840 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 3,
      label: "content-b",
      semanticRole: "content",
      classHint: "content-b",
      firstHeading: "Why teams choose us",
      tag: "section",
      bounds: { x: 0, y: 1848, width: 1440, height: 720 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 4,
      label: "footer-shell",
      semanticRole: "footer",
      classHint: "footer-shell",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const manifest: GuardrailSection[] = [
    reference[0],
    reference[1],
    reference[2],
    reference[2],
    reference[4],
  ]

  const result = summarizeExtractionCoverage(reference, manifest)

  assert.equal(result.passed, false)
  assert.equal(result.roleSequenceMismatch, true)
  assert.equal(result.missingVisibleRoles, false)
  assert.equal(result.extraVisibleRoles, false)
})

test("summarizeBuildBaseline rejects extra local top-level structure and returns failureCode EXTRACTION_INCOMPLETE", () => {
  const manifest: GuardrailSection[] = [
    {
      index: 0,
      label: "navbar",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero",
      firstHeading: "Meet your partner in time",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
  ]

  const local: GuardrailSection[] = [
    ...manifest,
    {
      index: 2,
      label: "footer-shell",
      semanticRole: "footer",
      classHint: "footer-shell",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const result = summarizeBuildBaseline({ manifest, reference: manifest, local })

  assert.equal(result.passed, false)
  assert.equal(result.failureCode, "EXTRACTION_INCOMPLETE")
  assert.deepEqual(result.extraLocalRoles, ["content"])
})

test("summarizeBuildBaseline rejects duplicated content sections", () => {
  const manifest: GuardrailSection[] = [
    {
      index: 0,
      label: "navbar",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero",
      firstHeading: "Meet your partner in time",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "content",
      semanticRole: "content",
      classHint: "content",
      firstHeading: "How it works",
      tag: "section",
      bounds: { x: 0, y: 1008, width: 1440, height: 840 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 3,
      label: "footer-shell",
      semanticRole: "footer",
      classHint: "footer-shell",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const local: GuardrailSection[] = [
    ...manifest,
    {
      index: 4,
      label: "content-secondary",
      semanticRole: "content",
      classHint: "content-secondary",
      firstHeading: "More detail",
      tag: "section",
      bounds: { x: 0, y: 5040, width: 1440, height: 640 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const result = summarizeBuildBaseline({ manifest, reference: manifest, local })

  assert.equal(result.passed, false)
  assert.deepEqual(result.extraLocalRoles, ["content"])
})

test("summarizeBuildBaseline rejects extra unknown top-level structure", () => {
  const manifest: GuardrailSection[] = [
    {
      index: 0,
      label: "navbar",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero",
      firstHeading: "Meet your partner in time",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "content",
      semanticRole: "content",
      classHint: "content",
      firstHeading: "How it works",
      tag: "section",
      bounds: { x: 0, y: 1008, width: 1440, height: 840 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 3,
      label: "footer-shell",
      semanticRole: "footer",
      classHint: "footer-shell",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const local: GuardrailSection[] = [
    ...manifest,
    {
      index: 4,
      label: "mystery-wrapper",
      semanticRole: "unknown",
      classHint: "mystery-wrapper",
      firstHeading: "",
      tag: "div",
      bounds: { x: 0, y: 4880, width: 1440, height: 120 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: false,
    },
  ]

  const result = summarizeBuildBaseline({ manifest, reference: manifest, local })

  assert.equal(result.passed, false)
  assert.equal(result.failureCode, "EXTRACTION_INCOMPLETE")
  assert.deepEqual(result.extraLocalRoles, ["unknown"])
  assert.deepEqual(result.missingLocalRoles, [])
})

test("summarizeBuildBaseline tolerates missing unknown top-level structure", () => {
  const manifest: GuardrailSection[] = [
    {
      index: 0,
      label: "navbar",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero",
      firstHeading: "Meet your partner in time",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "content",
      semanticRole: "content",
      classHint: "content",
      firstHeading: "How it works",
      tag: "section",
      bounds: { x: 0, y: 1008, width: 1440, height: 840 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 3,
      label: "footer",
      semanticRole: "footer",
      classHint: "footer",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 4,
      label: "wrapper",
      semanticRole: "unknown",
      classHint: "wrapper",
      firstHeading: "",
      tag: "div",
      bounds: { x: 0, y: 4680, width: 1440, height: 120 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: false,
    },
  ]

  const local = manifest.slice(0, 4)
  const result = summarizeBuildBaseline({ manifest, reference: manifest, local })

  assert.equal(result.passed, true)
  assert.equal(result.failureCode, null)
  assert.deepEqual(result.extraLocalRoles, [])
  assert.deepEqual(result.missingLocalRoles, [])
})

test("summarizeBuildBaseline passes when ordered semantic roles match despite wrapper naming differences", () => {
  const manifest: GuardrailSection[] = [
    {
      index: 0,
      label: "nav",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero-banner",
      firstHeading: "Meet your partner in time",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "content",
      semanticRole: "content",
      classHint: "content-shell",
      firstHeading: "How it works",
      tag: "section",
      bounds: { x: 0, y: 1008, width: 1440, height: 840 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 3,
      label: "footer",
      semanticRole: "footer",
      classHint: "footer-shell",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const local: GuardrailSection[] = [
    {
      index: 0,
      label: "top-bar",
      semanticRole: "nav",
      classHint: "site-nav",
      firstHeading: "",
      tag: "header",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "intro",
      semanticRole: "hero",
      classHint: "landing-hero",
      firstHeading: "Meet your partner in time",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "story",
      semanticRole: "content",
      classHint: "story-grid",
      firstHeading: "How it works",
      tag: "section",
      bounds: { x: 0, y: 1008, width: 1440, height: 840 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 3,
      label: "endcap",
      semanticRole: "footer",
      classHint: "page-footer",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const result = summarizeBuildBaseline({ manifest, reference: manifest, local })

  assert.equal(result.passed, true)
  assert.equal(result.failureCode, null)
  assert.deepEqual(result.extraLocalRoles, [])
  assert.deepEqual(result.missingLocalRoles, [])
})

test("summarizeBuildBaseline passes swapped same-role content sections (visual verification catches ordering)", () => {
  const manifest: GuardrailSection[] = [
    {
      index: 0,
      label: "nav",
      semanticRole: "nav",
      classHint: "site-nav",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero-banner",
      firstHeading: "Build faster",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "content-a",
      semanticRole: "content",
      classHint: "content-shell-a",
      firstHeading: "How it works",
      tag: "section",
      bounds: { x: 0, y: 1008, width: 1440, height: 840 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 3,
      label: "content-b",
      semanticRole: "content",
      classHint: "content-shell-b",
      firstHeading: "Why teams choose us",
      tag: "section",
      bounds: { x: 0, y: 1848, width: 1440, height: 720 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 4,
      label: "footer",
      semanticRole: "footer",
      classHint: "page-footer",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const local: GuardrailSection[] = [
    manifest[0],
    manifest[1],
    manifest[3],
    manifest[2],
    manifest[4],
  ]

  const result = summarizeBuildBaseline({ manifest, reference: manifest, local })

  assert.equal(result.passed, true)
  assert.equal(result.manifestSignatureMismatch, true)
  assert.equal(result.referenceSignatureMismatch, true)
})

test("summarizeBuildBaseline passes duplicated same-role sections with matching counts (visual verification catches duplicates)", () => {
  const manifest: GuardrailSection[] = [
    {
      index: 0,
      label: "nav",
      semanticRole: "nav",
      classHint: "site-nav",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero-banner",
      firstHeading: "Build faster",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "content-a",
      semanticRole: "content",
      classHint: "content-shell-a",
      firstHeading: "How it works",
      tag: "section",
      bounds: { x: 0, y: 1008, width: 1440, height: 840 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 3,
      label: "content-b",
      semanticRole: "content",
      classHint: "content-shell-b",
      firstHeading: "Why teams choose us",
      tag: "section",
      bounds: { x: 0, y: 1848, width: 1440, height: 720 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 4,
      label: "footer",
      semanticRole: "footer",
      classHint: "page-footer",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const local: GuardrailSection[] = [
    manifest[0],
    manifest[1],
    manifest[2],
    manifest[2],
    manifest[4],
  ]

  const result = summarizeBuildBaseline({ manifest, reference: manifest, local })

  assert.equal(result.passed, true)
  assert.equal(result.manifestSignatureMismatch, true)
  assert.equal(result.referenceSignatureMismatch, true)
})

test("summarizeBuildBaseline passes when local top-level roles match the manifest exactly", () => {
  const manifest: GuardrailSection[] = [
    {
      index: 0,
      label: "navbar",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero",
      firstHeading: "Meet your partner in time",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "content",
      semanticRole: "content",
      classHint: "content",
      firstHeading: "How it works",
      tag: "section",
      bounds: { x: 0, y: 1008, width: 1440, height: 840 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 3,
      label: "footer",
      semanticRole: "footer",
      classHint: "footer",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const local = manifest.map((section) => ({ ...section }))
  const result = summarizeBuildBaseline({ manifest, reference: manifest, local })

  assert.equal(result.passed, true)
  assert.equal(result.failureCode, null)
  assert.deepEqual(result.extraLocalRoles, [])
  assert.deepEqual(result.missingLocalRoles, [])
})

test("summarizeExtractionCoverage rejects swapped headingless content sections when class hints collide", () => {
  const reference: GuardrailSection[] = [
    {
      index: 0,
      label: "navbar",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero",
      firstHeading: "Build faster",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "feature-grid-a",
      semanticRole: "content",
      classHint: "feature-grid",
      firstHeading: "",
      textPreview: "Product tour with screenshots and guided setup.",
      tag: "section",
      bounds: { x: 0, y: 1008, width: 1440, height: 540 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 3,
      label: "feature-grid-b",
      semanticRole: "content",
      classHint: "feature-grid",
      firstHeading: "",
      textPreview: "Customer logos and analyst quotes with social proof.",
      tag: "section",
      bounds: { x: 0, y: 1548, width: 1440, height: 780 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 4,
      label: "footer",
      semanticRole: "footer",
      classHint: "footer",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const manifest: GuardrailSection[] = [
    reference[0],
    reference[1],
    { ...reference[3], index: 2 },
    { ...reference[2], index: 3 },
    reference[4],
  ]

  const result = summarizeExtractionCoverage(reference, manifest)

  assert.equal(result.passed, false)
  assert.equal(result.roleSequenceMismatch, true)
})

test("summarizeBuildBaseline passes swapped headingless content sections (visual verification catches ordering)", () => {
  const manifest: GuardrailSection[] = [
    {
      index: 0,
      label: "navbar",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero",
      firstHeading: "Build faster",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "content-a",
      semanticRole: "content",
      classHint: "wrapper",
      firstHeading: "",
      textPreview: "Product tour with screenshots and guided setup.",
      tag: "section",
      bounds: { x: 0, y: 1008, width: 1440, height: 540 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 3,
      label: "content-b",
      semanticRole: "content",
      classHint: "wrapper",
      firstHeading: "",
      textPreview: "Customer logos and analyst quotes with social proof.",
      tag: "section",
      bounds: { x: 0, y: 1548, width: 1440, height: 780 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 4,
      label: "footer",
      semanticRole: "footer",
      classHint: "footer",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const local: GuardrailSection[] = [
    manifest[0],
    manifest[1],
    { ...manifest[3], index: 2, bounds: { x: 0, y: 1008, width: 1440, height: 760 } },
    { ...manifest[2], index: 3, bounds: { x: 0, y: 1768, width: 1440, height: 560 } },
    manifest[4],
  ]

  const result = summarizeBuildBaseline({ manifest, reference: manifest, local })

  assert.equal(result.passed, true)
  assert.equal(result.manifestSignatureMismatch, true)
  assert.equal(result.referenceSignatureMismatch, true)
})

test("summarizeBuildBaseline passes mismatched unknown wrappers when counts match (visual verification catches content)", () => {
  const manifest: GuardrailSection[] = [
    {
      index: 0,
      label: "navbar",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "wrapper-a",
      semanticRole: "unknown",
      classHint: "wrapper",
      firstHeading: "",
      textPreview: "Trusted by global teams.",
      tag: "div",
      bounds: { x: 0, y: 88, width: 1440, height: 180 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: false,
    },
    {
      index: 2,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero",
      firstHeading: "Build faster",
      tag: "section",
      bounds: { x: 0, y: 268, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 3,
      label: "footer",
      semanticRole: "footer",
      classHint: "footer",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const local: GuardrailSection[] = [
    manifest[0],
    {
      index: 1,
      label: "wrapper-b",
      semanticRole: "unknown",
      classHint: "wrapper",
      firstHeading: "",
      textPreview: "Security certifications and compliance badges.",
      tag: "div",
      bounds: { x: 0, y: 88, width: 1440, height: 420 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: false,
    },
    { ...manifest[2], bounds: { x: 0, y: 508, width: 1440, height: 920 } },
    manifest[3],
  ]

  const result = summarizeBuildBaseline({ manifest, reference: manifest, local })

  assert.equal(result.passed, true)
  assert.equal(result.manifestSignatureMismatch, true)
  assert.equal(result.referenceSignatureMismatch, false)
})

test("summarizeBuildBaseline ignores noisy text differences for headingless link-heavy div wrappers", () => {
  const manifest: GuardrailSection[] = [
    {
      index: 0,
      label: "header-shell",
      semanticRole: "content",
      classHint: "header-shell",
      firstHeading: "",
      textPreview: "ProductsChevronDownIconSee what's comingNew Operating System of Time",
      tag: "div",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "hero",
      semanticRole: "content",
      classHint: "hero",
      firstHeading: "Build faster",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: false,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "footer-shell",
      semanticRole: "content",
      classHint: "footer-shell",
      firstHeading: "",
      textPreview: "HomeIconChevronRightIconIntegrations context https schema org type",
      tag: "div",
      bounds: { x: 0, y: 1008, width: 1440, height: 360 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const local: GuardrailSection[] = [
    {
      ...manifest[0],
      textPreview: "Products Industries Resources Pricing Log in Sign up Create a Doodle",
    },
    manifest[1],
    {
      ...manifest[2],
      textPreview: "Home Integrations Help Contact Pricing Talk to sales About Doodle",
    },
  ]

  const result = summarizeBuildBaseline({ manifest, reference: manifest, local })

  assert.equal(result.passed, true)
  assert.equal(result.manifestSignatureMismatch, false)
  assert.equal(result.referenceSignatureMismatch, false)
})

test("summarizeBuildBaseline passes swapped short headingless sections (visual verification catches ordering)", () => {
  const manifest: GuardrailSection[] = [
    {
      index: 0,
      label: "navbar",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero",
      firstHeading: "Build faster",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
    {
      index: 2,
      label: "content-a",
      semanticRole: "content",
      classHint: "wrapper",
      firstHeading: "",
      textPreview: "Fast launch",
      tag: "section",
      bounds: { x: 0, y: 1008, width: 1440, height: 500 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 3,
      label: "content-b",
      semanticRole: "content",
      classHint: "wrapper",
      firstHeading: "",
      textPreview: "See pricing",
      tag: "section",
      bounds: { x: 0, y: 1508, width: 1440, height: 520 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 4,
      label: "footer",
      semanticRole: "footer",
      classHint: "footer",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 4200, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const local: GuardrailSection[] = [
    manifest[0],
    manifest[1],
    { ...manifest[3], index: 2, bounds: { x: 0, y: 1008, width: 1440, height: 500 } },
    { ...manifest[2], index: 3, bounds: { x: 0, y: 1508, width: 1440, height: 520 } },
    manifest[4],
  ]

  const result = summarizeBuildBaseline({ manifest, reference: manifest, local })

  assert.equal(result.passed, true)
  assert.equal(result.manifestSignatureMismatch, true)
  assert.equal(result.referenceSignatureMismatch, true)
})

test("summarizeBuildBaseline rejects when the live reference has a missing top-level section", () => {
  const manifest: GuardrailSection[] = [
    {
      index: 0,
      label: "navbar",
      semanticRole: "nav",
      classHint: "navbar",
      firstHeading: "",
      tag: "nav",
      bounds: { x: 0, y: 0, width: 1440, height: 88 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
    {
      index: 1,
      label: "hero",
      semanticRole: "hero",
      classHint: "hero",
      firstHeading: "Build faster",
      tag: "section",
      bounds: { x: 0, y: 88, width: 1440, height: 920 },
      hasVideo: true,
      hasBackgroundImage: true,
      hasInteractiveLinks: true,
    },
  ]

  const reference: GuardrailSection[] = [
    ...manifest,
    {
      index: 2,
      label: "footer",
      semanticRole: "footer",
      classHint: "footer",
      firstHeading: "",
      tag: "footer",
      bounds: { x: 0, y: 1008, width: 1440, height: 480 },
      hasVideo: false,
      hasBackgroundImage: false,
      hasInteractiveLinks: true,
    },
  ]

  const local = manifest.map((section) => ({ ...section }))
  const result = summarizeBuildBaseline({ manifest, reference, local })

  assert.equal(result.passed, false)
  assert.equal(result.failureCode, "EXTRACTION_INCOMPLETE")
  assert.equal(result.manifestSignatureMismatch, false)
  assert.equal(result.referenceSignatureMismatch, true)
})
