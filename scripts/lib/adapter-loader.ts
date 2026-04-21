import { readFileSync } from "fs"

export interface AdapterDetection {
  jsMarkers?: string[]
  domMarkers?: string[]
  urlPatterns?: string[]
  metaGenerator?: string | null
  httpHeaders?: Record<string, string>
}

export interface AdapterSectionDiscovery {
  primarySelector?: string
  spaContainerHints?: string[]
  skipSelectors?: string[]
  sectionLabelPatterns?: string[]
  minExpectedSections?: number
  disableUnwrap?: boolean
}

export interface WrapperMapping {
  classPattern: string
  tailwindClasses: string
}

export interface AdapterStyles {
  wrapperMappings?: WrapperMapping[]
  scopedStylePrefix?: string
  globalSelectors?: {
    containerMax?: string
    paddingGlobal?: string
    sectionPaddingLarge?: string
    sectionPaddingMedium?: string
  }
}

export interface AdapterImages {
  cdnPatterns?: string[]
  assetIdPattern?: string
  lazyLoadStrategy?: "native" | "intersection-observer" | "scroll-trigger" | "none"
  responsiveFormat?: string | null
}

export interface AdapterAnimations {
  engine?: "ix2" | "css-transitions" | "framer-motion" | "gsap" | "svelte-transition" | "vue-transition" | "squarespace-animation-runtime" | "waypoints-css" | "animate-css" | "none" | string
  dataSource?: string | null
  transitionProperty?: string | null
}

export interface AdapterQuirk {
  id: string
  description: string
  workaround?: string
}

export interface AdapterLocalSite {
  sectionSelector?: string
  devToolsHideScript?: string
}

export interface AdapterDynamicElement {
  selector: string
  reason: string
}

export interface PlatformAdapter {
  platform: string
  type: "framework" | "cms"
  version: string
  detection?: AdapterDetection
  sectionDiscovery?: AdapterSectionDiscovery
  styles?: AdapterStyles
  images?: AdapterImages
  animations?: AdapterAnimations
  quirks?: AdapterQuirk[]
  localSite?: AdapterLocalSite
  dynamicElements?: AdapterDynamicElement[]
}

export interface MergedAdapter {
  platforms: string[]
  detection: AdapterDetection
  sectionDiscovery: AdapterSectionDiscovery
  styles: AdapterStyles
  images: AdapterImages
  animations: AdapterAnimations
  quirks: AdapterQuirk[]
  localSite: AdapterLocalSite
  dynamicElements?: AdapterDynamicElement[]
}

function concatArrays<T>(a?: T[], b?: T[]): T[] {
  return [...(a ?? []), ...(b ?? [])]
}

function adapterToMerged(adapter: PlatformAdapter): MergedAdapter {
  return {
    platforms: [adapter.platform],
    detection: adapter.detection ?? {},
    sectionDiscovery: adapter.sectionDiscovery ?? {},
    styles: adapter.styles ?? {},
    images: adapter.images ?? {},
    animations: adapter.animations ?? {},
    quirks: adapter.quirks ?? [],
    localSite: adapter.localSite ?? {},
    dynamicElements: adapter.dynamicElements,
  }
}

export function loadAdapters(paths: string[]): MergedAdapter {
  if (paths.length === 0) throw new Error("At least one adapter path required")

  const adapters = paths.map((p) => {
    const raw = readFileSync(p, "utf-8")
    return JSON.parse(raw) as PlatformAdapter
  })

  const frameworks = adapters.filter((a) => a.type === "framework")
  const cmsList = adapters.filter((a) => a.type === "cms")

  if (frameworks.length > 1) {
    throw new Error(
      `Multiple framework adapters not supported: ${frameworks.map((f) => f.platform).join(", ")}. A site has one frontend framework.`
    )
  }

  if (frameworks.length === 0 && cmsList.length === 0) {
    throw new Error("No valid adapters found")
  }

  // Single adapter — wrap directly
  if (adapters.length === 1) return adapterToMerged(adapters[0])

  // Framework + CMS(es) — merge
  const framework = frameworks[0]
  if (!framework) {
    // Only CMS adapters — merge them together
    let merged = adapterToMerged(cmsList[0])
    for (let i = 1; i < cmsList.length; i++) {
      const prev = merged
      merged = adapterToMerged(cmsList[i])
      merged.platforms = [...prev.platforms, cmsList[i].platform]
      merged.detection.jsMarkers = concatArrays(prev.detection.jsMarkers, merged.detection.jsMarkers)
      merged.detection.domMarkers = concatArrays(prev.detection.domMarkers, merged.detection.domMarkers)
      merged.detection.urlPatterns = concatArrays(prev.detection.urlPatterns, merged.detection.urlPatterns)
      merged.images.cdnPatterns = concatArrays(prev.images.cdnPatterns, merged.images.cdnPatterns)
      merged.quirks = concatArrays(prev.quirks, merged.quirks)
      merged.dynamicElements = concatArrays(prev.dynamicElements, merged.dynamicElements)
    }
    return merged
  }

  // Merge framework with all CMS adapters incrementally
  let merged = adapterToMerged(framework)
  for (const cms of cmsList) {
    const cmsWrapped = adapterToMerged(cms)
    merged = {
      ...merged,
      platforms: [...merged.platforms, cms.platform],
      detection: {
        jsMarkers: concatArrays(merged.detection.jsMarkers, cmsWrapped.detection.jsMarkers),
        domMarkers: concatArrays(merged.detection.domMarkers, cmsWrapped.detection.domMarkers),
        urlPatterns: concatArrays(merged.detection.urlPatterns, cmsWrapped.detection.urlPatterns),
      },
      images: {
        cdnPatterns: concatArrays(merged.images.cdnPatterns, cmsWrapped.images.cdnPatterns),
        assetIdPattern: cmsWrapped.images.assetIdPattern ?? merged.images.assetIdPattern,
        lazyLoadStrategy: cmsWrapped.images.lazyLoadStrategy ?? merged.images.lazyLoadStrategy,
        responsiveFormat: cmsWrapped.images.responsiveFormat ?? merged.images.responsiveFormat,
      },
      quirks: concatArrays(merged.quirks, cmsWrapped.quirks),
      dynamicElements: concatArrays(merged.dynamicElements, cmsWrapped.dynamicElements),
    }
  }

  return merged
}

/** Parse --adapter flags from process.argv and load adapters. Returns null if no --adapter flags. */
export function loadAdaptersFromArgs(): MergedAdapter | null {
  const paths: string[] = []
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === "--adapter" && i + 1 < process.argv.length) {
      paths.push(process.argv[++i])
    }
  }
  if (paths.length === 0) return null
  return loadAdapters(paths)
}
