export interface ProbeRecommendationInput {
  unmatchedPlatforms: string[]
  hasDetectedFramework: boolean
  detectedFrameworks: string[]
  contentMatchesUrl: boolean
  h1MatchesUrl: boolean
  expectedContentMatched: boolean
}

export interface ProbeRecommendationResult {
  fallbackSignals: string[]
  suspectedFallback: boolean
  recommendation: "DIRECT_EXTRACTION" | "SPA_FLOW_EXTRACTION" | "ABORT_NO_ADAPTER"
}

const H1_OPTIONAL_FRAMEWORKS = new Set(["gatsby"])

export function buildProbeRecommendation(input: ProbeRecommendationInput): ProbeRecommendationResult {
  const fallbackSignals: string[] = []

  if (!input.contentMatchesUrl) fallbackSignals.push("url-content-mismatch")

  const allowMissingH1Signal =
    input.contentMatchesUrl &&
    !input.h1MatchesUrl &&
    input.detectedFrameworks.length > 0 &&
    input.detectedFrameworks.every((framework) => H1_OPTIONAL_FRAMEWORKS.has(framework))

  if (!input.h1MatchesUrl && !allowMissingH1Signal) fallbackSignals.push("h1-url-mismatch")
  if (!input.expectedContentMatched) fallbackSignals.push("expected-content-missing")

  const suspectedFallback = fallbackSignals.length > 0 && input.hasDetectedFramework

  if (input.unmatchedPlatforms.length > 0) {
    return {
      fallbackSignals,
      suspectedFallback,
      recommendation: "ABORT_NO_ADAPTER",
    }
  }

  return {
    fallbackSignals,
    suspectedFallback,
    recommendation: suspectedFallback ? "SPA_FLOW_EXTRACTION" : "DIRECT_EXTRACTION",
  }
}
