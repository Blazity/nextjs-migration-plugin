import type { SemanticRole, StructuralBounds } from "./structure-snapshot.ts"

export interface GuardrailSection {
  index: number
  label: string
  semanticRole: SemanticRole
  classHint: string
  firstHeading: string
  textPreview?: string
  tag: string
  bounds: StructuralBounds
  hasVideo: boolean
  hasBackgroundImage: boolean
  hasInteractiveLinks: boolean
}

export interface ExtractionCoverageResult {
  passed: boolean
  missingRequiredRoles: SemanticRole[]
  genericLabels: string[]
  missingVisibleRoles: boolean
  extraVisibleRoles: boolean
  roleSequenceMismatch: boolean
}

export interface BuildBaselineResult {
  passed: boolean
  failureCode: "EXTRACTION_INCOMPLETE" | null
  extraLocalRoles: SemanticRole[]
  missingLocalRoles: SemanticRole[]
  manifestSignatureMismatch: boolean
  referenceSignatureMismatch: boolean
}

const ROLE_ORDER: SemanticRole[] = [
  "header",
  "nav",
  "hero",
  "content",
  "footer",
  "unknown",
]

export const GENERIC_LABELS = new Set([
  "page-wrapper",
  "div",
  "body",
  "app",
  "root",
  "main",
  "section",
  "wrapper",
  "container",
  "component",
  "overflow-hidden",
  "padding-global",
  "container-large",
  "container-small",
  "padding-section",
  "padding-section-large",
  "padding-section-medium",
])

export { deriveSemanticRole } from "./structure-snapshot.ts"

function meaningfulSections(sections: GuardrailSection[]): GuardrailSection[] {
  return sections.filter((section) => section.semanticRole !== "unknown")
}

function countRoles(
  sections: GuardrailSection[],
  includeUnknown = true
): Map<SemanticRole, number> {
  const counts = new Map<SemanticRole, number>()
  for (const section of sections) {
    if (!includeUnknown && section.semanticRole === "unknown") continue
    counts.set(section.semanticRole, (counts.get(section.semanticRole) ?? 0) + 1)
  }
  return counts
}

function diffRoles(
  expected: GuardrailSection[],
  actual: GuardrailSection[],
  includeUnknown: boolean
): {
  extra: SemanticRole[]
  missing: SemanticRole[]
} {
  const expectedCounts = countRoles(expected, includeUnknown)
  const actualCounts = countRoles(actual, includeUnknown)
  const extra: SemanticRole[] = []
  const missing: SemanticRole[] = []

  for (const role of ROLE_ORDER) {
    if (!includeUnknown && role === "unknown") continue
    const expectedCount = expectedCounts.get(role) ?? 0
    const actualCount = actualCounts.get(role) ?? 0
    if (actualCount > expectedCount) {
      extra.push(...Array(actualCount - expectedCount).fill(role))
    } else if (expectedCount > actualCount) {
      missing.push(...Array(expectedCount - actualCount).fill(role))
    }
  }

  return { extra, missing }
}

function isGenericSignal(value: string): boolean {
  return GENERIC_LABELS.has(value.toLowerCase())
}

function normalizeSignal(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

function normalizeTextPreview(value: string | undefined): string {
  const tokens = (value ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? []
  if (tokens.length === 0) return ""
  return tokens.slice(0, 10).join(" ")
}

function shouldUseBuildTextPreview(section: GuardrailSection): boolean {
  if (section.firstHeading.trim().length > 0) return true
  if (section.tag.toLowerCase() !== "div") return true
  if (!section.hasInteractiveLinks) return true
  if (section.hasVideo || section.hasBackgroundImage) return true
  return false
}

function shapeSignature(bounds: StructuralBounds): string {
  return `h${Math.max(1, Math.round(bounds.height / 160))}`
}

function sectionSignature(
  section: GuardrailSection,
  mode: "extraction" | "build"
): string {
  const role = section.semanticRole
  const heading = normalizeSignal(section.firstHeading)
  const textPreview =
    mode === "build" && !shouldUseBuildTextPreview(section)
      ? ""
      : normalizeTextPreview(section.textPreview)
  const tokens: string[] = [role]

  if (heading.length > 0) {
    tokens.push(`heading:${heading}`)
  } else if (textPreview.length > 0) {
    tokens.push(`text:${textPreview}`)
  }

  if (mode === "extraction") {
    const classHint = normalizeSignal(section.classHint)
    if (heading.length === 0 && classHint.length > 0 && !isGenericSignal(classHint)) {
      tokens.push(`class:${classHint}`)
    }
  } else {
    const cues = [
      section.hasVideo ? "video" : "",
      section.hasBackgroundImage ? "background" : "",
      section.hasInteractiveLinks ? "links" : "",
    ].filter(Boolean)

    if (cues.length > 0) {
      tokens.push(`cue:${cues.join("+")}`)
    }
  }

  if (heading.length === 0) {
    tokens.push(`shape:${shapeSignature(section.bounds)}`)
  }

  if (tokens.length === 1) {
    tokens.push(`tag:${normalizeSignal(section.tag)}`)
  }

  return tokens.join("|")
}

function sectionSignatures(
  sections: GuardrailSection[],
  mode: "extraction" | "build",
  options?: { includeUnknown?: boolean }
): string[] {
  const filteredSections = options?.includeUnknown ? sections : meaningfulSections(sections)
  return filteredSections.map((section) => sectionSignature(section, mode))
}

function isOrderedSubsequence(expected: string[], actual: string[]): boolean {
  if (actual.length === 0) return true

  let actualIndex = 0
  for (const signature of expected) {
    if (signature === actual[actualIndex]) {
      actualIndex += 1
      if (actualIndex === actual.length) return true
    }
  }

  return false
}

function hasOrderedRoleSequenceMismatch(
  expected: GuardrailSection[],
  actual: GuardrailSection[],
  mode: "extraction" | "build"
): boolean {
  const expectedSignatures = sectionSignatures(expected, mode)
  const actualSignatures = sectionSignatures(actual, mode)
  if (expectedSignatures.length !== actualSignatures.length) return true
  for (let i = 0; i < expectedSignatures.length; i++) {
    if (expectedSignatures[i] !== actualSignatures[i]) return true
  }
  return false
}

function hasBuildSignatureMismatch(
  expected: GuardrailSection[],
  actual: GuardrailSection[]
): boolean {
  const expectedSignatures = sectionSignatures(expected, "build", { includeUnknown: true })
  const actualSignatures = sectionSignatures(actual, "build", { includeUnknown: true })
  return !isOrderedSubsequence(expectedSignatures, actualSignatures)
}

export function summarizeExtractionCoverage(
  reference: GuardrailSection[],
  manifest: GuardrailSection[]
): ExtractionCoverageResult {
  const referenceCounts = countRoles(reference, false)
  const manifestCounts = countRoles(manifest, false)
  const requiredRoles: SemanticRole[] = ["nav", "hero", "footer"]
  const missingRequiredRoles = requiredRoles.filter((role) => {
    const referenceCount = referenceCounts.get(role) ?? 0
    const manifestCount = manifestCounts.get(role) ?? 0
    return referenceCount > 0 && manifestCount < referenceCount
  })
  const visibleRoles = ROLE_ORDER.filter((role) => role !== "unknown")
  const missingVisibleRoles = visibleRoles.some(
    (role) => (referenceCounts.get(role) ?? 0) > (manifestCounts.get(role) ?? 0)
  )
  const extraVisibleRoles = visibleRoles.some(
    (role) => (manifestCounts.get(role) ?? 0) > (referenceCounts.get(role) ?? 0)
  )
  const roleSequenceMismatch = hasOrderedRoleSequenceMismatch(reference, manifest, "extraction")
  const genericLabels = manifest
    .flatMap((section) => {
      const signals: string[] = []
      if (isGenericSignal(section.label)) signals.push(section.label)
      if (isGenericSignal(section.classHint)) signals.push(section.classHint)
      return signals
    })
    .filter((signal, index, allSignals) => allSignals.indexOf(signal) === index)

  return {
    passed:
      missingRequiredRoles.length === 0 &&
      !missingVisibleRoles &&
      !extraVisibleRoles &&
      !roleSequenceMismatch &&
      genericLabels.length === 0,
    missingRequiredRoles,
    genericLabels,
    missingVisibleRoles,
    extraVisibleRoles,
    roleSequenceMismatch,
  }
}

function normalizeRolesForBuildComparison(sections: GuardrailSection[]): GuardrailSection[] {
  return sections.map((s) => ({
    ...s,
    semanticRole: s.semanticRole === "unknown" ? "unknown" : "content",
  }))
}

export function summarizeBuildBaseline(input: {
  manifest: GuardrailSection[]
  reference?: GuardrailSection[]
  local: GuardrailSection[]
}): BuildBaselineResult {
  const reference = input.reference ?? input.manifest
  // Normalize all non-unknown roles to "content" before comparing.
  // The reference site (e.g., Gatsby) and local site (Next.js) derive different semantic
  // roles from their HTML tags — a <div class="header"> becomes "content" in extraction
  // but a <header> becomes "header" locally. The baseline check should only verify
  // that all sections exist, not that they got the same semantic label.
  const { extra: extraLocalRoles, missing: missingLocalRoles } = diffRoles(
    normalizeRolesForBuildComparison(input.manifest),
    normalizeRolesForBuildComparison(input.local),
    false
  )
  const manifestUnknownCount = countRoles(input.manifest, true).get("unknown") ?? 0
  const localUnknownCount = countRoles(input.local, true).get("unknown") ?? 0
  const extraUnknownLocalRoles =
    localUnknownCount > manifestUnknownCount
      ? Array(localUnknownCount - manifestUnknownCount).fill("unknown" as SemanticRole)
      : []
  const manifestSignatureMismatch = hasBuildSignatureMismatch(input.manifest, input.local)
  const referenceSignatureMismatch = hasOrderedRoleSequenceMismatch(
    reference,
    input.local,
    "build"
  )
  const referenceSectionCountMismatch =
    meaningfulSections(reference).length !== meaningfulSections(input.local).length
  const passed =
    extraLocalRoles.length === 0 &&
    extraUnknownLocalRoles.length === 0 &&
    missingLocalRoles.length === 0 &&
    !referenceSectionCountMismatch

  return {
    passed,
    failureCode: passed ? null : "EXTRACTION_INCOMPLETE",
    extraLocalRoles: [...extraLocalRoles, ...extraUnknownLocalRoles],
    missingLocalRoles,
    manifestSignatureMismatch,
    referenceSignatureMismatch,
  }
}
