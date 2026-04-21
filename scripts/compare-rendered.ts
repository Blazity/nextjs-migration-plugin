import { chromium, type Page } from "@playwright/test"
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs"
import { join } from "path"
import { freezeDynamicContent, dismissCookies } from "./lib/freeze.ts"
import { createMapper } from "./lib/tailwind-mapper.ts"
import { loadAdaptersFromArgs } from "./lib/adapter-loader.ts"

const REFERENCE_URL = process.argv[2] || "https://blazity.com"
const LOCAL_URL = process.argv[3] || "http://localhost:3000"
const PAGE_NAME = process.argv[4] || "homepage"
const OUTPUT_DIR = join("docs/rendered-diffs", PAGE_NAME)
const ADAPTER = loadAdaptersFromArgs()
const freezeOpts = ADAPTER ? { localSite: ADAPTER.localSite } : undefined

const DEFAULT_SECTION_META: Record<number, { name: string; file: string }> = {
  0: { name: "navbar", file: "src/components/layout/navbar.tsx" },
  1: { name: "banner", file: "src/components/sections/banner-vercel.tsx" },
  2: { name: "hero", file: "src/components/sections/hero-section.tsx" },
  3: { name: "stats", file: "src/components/sections/stats-block.tsx" },
  4: { name: "services", file: "src/components/sections/services-tabs.tsx" },
  5: { name: "testimonials", file: "src/components/sections/testimonial-carousel.tsx" },
  6: { name: "cta", file: "src/components/sections/cta-section.tsx" },
  7: { name: "open-source", file: "src/components/sections/open-source-section.tsx" },
  8: { name: "case-studies", file: "src/components/sections/case-studies-section.tsx" },
  9: { name: "community", file: "src/components/sections/community-section.tsx" },
  10: { name: "contact", file: "src/components/sections/contact-form.tsx" },
  11: { name: "footer", file: "src/components/layout/footer.tsx" },
}

let SECTION_META = { ...DEFAULT_SECTION_META }
try {
  const custom = JSON.parse(readFileSync(join(OUTPUT_DIR, "section-map.json"), "utf-8"))
  SECTION_META = { ...SECTION_META, ...custom }
} catch {}

const MIGRATION_RULES = `
MIGRATION RULES (follow ALL of these):
1. Never write text from memory — copy reference text exactly from the diffs below
2. All text must match the reference character-for-character. If not in the diff, use Playwright MCP to read from the reference URL
3. T1 diffs include FIND/REPLACE. Do a surgical string replacement within the className — NOT a full className rewrite
4. T2 diffs describe visual INTENT. DO NOT apply pixel values or computed widths. Fix the visual issue using React-appropriate patterns
5. T3 diffs include the FULL reference text. COPY IT EXACTLY
6. Use exact values — text-[14px] not text-sm, text-[80px] not text-8xl. Never approximate
7. Container padding is px-[5%] not fixed pixels
8. Body text default is text-neutral-800 not text-neutral-900
9. Transition durations: duration-[275ms] not Tailwind default 150ms
10. Use local image paths from public/images/ — never CDN URLs
11. Use next/image <Image> with explicit width and height
12. Never ADD animations unless the diff explicitly says to
13. Never REMOVE existing working animations (typing, marquee, carousel)
14. Entrance animations use whileInView with viewport={{ once: true }}
15. Don't restructure the component — only change what the diff specifies
16. Never remove existing interactivity (carousel state, form handlers, tab switching)
17. Verify each fix with Playwright MCP — read computed style, confirm it matches
18. If a fix makes things worse, revert immediately: git checkout -- <file>
19. Max 3 attempts per diff, then flag and move on
20. Process tiers in order: T3-CONTENT first, T1-AUTO second, T2-LAYOUT last
`.trim()

const SECTION_ANIMATION_SPEC: Record<string, string> = {
  "0": "docs/specs/homepage/01-navbar-component.animations.json",
  "1": "docs/specs/homepage/02-banner-vercel.animations.json",
  "2": "docs/specs/homepage/03-ai-native-next-js-architects.animations.json",
  "3": "docs/specs/homepage/04-stats-home.animations.json",
  "4": "docs/specs/homepage/05-our-offer.animations.json",
  "5": "docs/specs/homepage/06-blazity-s-work-has-increased.animations.json",
  "6": "docs/specs/homepage/07-every-second-your-frontend-los.animations.json",
  "7": "docs/specs/homepage/08-proof-before-commitment.animations.json",
  "8": "docs/specs/homepage/09-results-not-promises.animations.json",
  "9": "docs/specs/homepage/10-from-our-engineers.animations.json",
  "10": "docs/specs/homepage/11-no-pitch-deck-just-a-technica.animations.json",
  "11": "docs/specs/homepage/12-section-footer.animations.json",
}

function checkAnimationCrossRef(sectionIdx: number): ElementDiff | null {
  const specFile = SECTION_ANIMATION_SPEC[String(sectionIdx)]
  const componentFile = SECTION_META[sectionIdx]?.file
  if (!specFile || !componentFile || !existsSync(specFile)) return null

  const spec = JSON.parse(readFileSync(specFile, "utf-8"))
  const hasScrollTrigger = (spec.animations || []).some(
    (a: { trigger?: string }) => a.trigger === "scroll-into-view"
  )
  if (!hasScrollTrigger) return null

  if (!existsSync(componentFile)) return null
  const source = readFileSync(componentFile, "utf-8")
  if (source.includes("whileInView")) return null

  const sectionName = SECTION_META[sectionIdx]?.name || `section-${sectionIdx}`
  return {
    type: "animation",
    element: `${sectionName} section`,
    matchType: "spec-cross-ref",
    sectionIndex: sectionIdx,
    diffs: [{
      property: "entrance-animation",
      refValue: "scroll-into-view triggers in animations.json",
      localValue: "MISSING — no whileInView in component",
      suggestedFix: "Add motion.div with initial/whileInView per animations.json",
    }],
  }
}

// Tier 1: AUTO-FIX — safe to change mechanically
const T1_PROPERTIES = [
  "fontSize", "fontWeight", "fontFamily", "lineHeight", "letterSpacing",
  "textTransform", "color", "backgroundColor",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "borderRadius", "borderWidth",
  "gap",
  "opacity",
]

// Tier 2: LAYOUT INTENT — compare but output as visual description, not class replacement
const T2_PROPERTIES = [
  "justifyContent", "alignItems", "flexDirection",
  "display", "overflow", "textAlign",
]

// NEVER compared: width, height, maxWidth, gridTemplateColumns, gridTemplateRows,
// position, top, right, bottom, left, zIndex — these are derived/structural

const ANIMATION_PROPS = [
  "transitionDuration", "transitionTimingFunction",
  "animationDuration", "animationTimingFunction", "animationDelay",
]

const IGNORE_VALUES = new Set([
  "0px", "none", "normal", "auto", "rgba(0, 0, 0, 0)", "start",
  "visible", "nowrap", "row", "0", "1", "static", "stretch", "baseline",
  "transparent", "currentcolor",
])

// --- Types ---

interface ElementInfo {
  sectionIndex: number
  tag: string
  text: string
  textNormalized: string
  fullText: string
  depth: number
  childIndex: number
  path: string
  relativeX: number
  relativeY: number
  src?: string
  alt?: string
  href?: string
  t1Styles: Record<string, string>
  t2Styles: Record<string, string>
  animationStyles: Record<string, string>
  width: number
  height: number
}

interface MatchedPair {
  ref: ElementInfo
  local: ElementInfo
  matchType: "text" | "position" | "image"
  score: number
}

interface UnmatchedElement {
  element: ElementInfo
  site: "reference" | "local"
}

interface PropertyDiff {
  property: string
  refValue: string
  localValue: string
  suggestedFix: string
}

interface ElementDiff {
  type: "static" | "animation" | "image" | "missing" | "text"
  element: string
  matchType: string
  sectionIndex: number
  diffs: PropertyDiff[]
  score?: number
}

// --- Element Walking ---

async function walkElements(page: Page): Promise<ElementInfo[]> {
  // Large evaluate block — passed as string for readability (100+ lines of DOM walking)
  const propsJson = JSON.stringify({ t1: T1_PROPERTIES, t2: T2_PROPERTIES, animation: ANIMATION_PROPS, ignore: [...IGNORE_VALUES] })
  return page.evaluate(`(() => {
    var props = ${propsJson};
    var results = [];
    var ignoreSet = new Set(props.ignore);
    var skipTags = new Set(["script", "noscript", "style", "link"]);
    var sections = [];
    var mainEl = document.querySelector("main");
    if (mainEl) {
      // Next.js layout: header + main children + footer
      var header = document.querySelector("header");
      if (header && header.getBoundingClientRect().height > 10) sections.push(header);
      for (var i = 0; i < mainEl.children.length; i++) {
        var el = mainEl.children[i];
        var tag = el.tagName.toLowerCase();
        if (!skipTags.has(tag) && el.getBoundingClientRect().height > 10) sections.push(el);
      }
      var footer = document.querySelector("footer");
      if (footer && footer.getBoundingClientRect().height > 10) sections.push(footer);
    } else {
      // Webflow: all sections as direct body children
      for (var i = 0; i < document.body.children.length; i++) {
        var el = document.body.children[i];
        var tag = el.tagName.toLowerCase();
        if (!skipTags.has(tag) && el.getBoundingClientRect().height > 10) sections.push(el);
      }
    }
    for (var si = 0; si < sections.length; si++) {
      var section = sections[si];
      var sectionIndex = si;
      var sectionRect = section.getBoundingClientRect();
      var stack = [{ el: section, depth: 0, childIndex: sectionIndex, path: "section[" + sectionIndex + "]" }];
      while (stack.length > 0) {
        var item = stack.pop();
        var el = item.el;
        var depth = item.depth;
        var childIndex = item.childIndex;
        var path = item.path;
        var rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        var tag = el.tagName.toLowerCase();
        if (["script","noscript","style","link","br","hr"].indexOf(tag) >= 0) continue;
        var cs = window.getComputedStyle(el);
        var t1Styles = {};
        for (var pi = 0; pi < props.t1.length; pi++) {
          var p = props.t1[pi];
          var cssP = p.replace(/[A-Z]/g, function(m) { return "-" + m.toLowerCase(); });
          var val = cs.getPropertyValue(cssP);
          if (val && !ignoreSet.has(val)) t1Styles[p] = val;
        }
        var t2Styles = {};
        for (var pi = 0; pi < props.t2.length; pi++) {
          var p = props.t2[pi];
          var cssP = p.replace(/[A-Z]/g, function(m) { return "-" + m.toLowerCase(); });
          var val = cs.getPropertyValue(cssP);
          if (val && !ignoreSet.has(val)) t2Styles[p] = val;
        }
        var animationStyles = {};
        for (var ai = 0; ai < props.animation.length; ai++) {
          var p = props.animation[ai];
          var cssP = p.replace(/[A-Z]/g, function(m) { return "-" + m.toLowerCase(); });
          var val = cs.getPropertyValue(cssP);
          if (val && val !== "0s" && val !== "none") animationStyles[p] = val;
        }
        var directText = "";
        for (var ci = 0; ci < el.childNodes.length; ci++) {
          var n = el.childNodes[ci];
          if (n.nodeType === Node.TEXT_NODE) {
            var t = (n.textContent || "").trim();
            if (t) directText += (directText ? " " : "") + t;
          }
        }
        directText = directText.slice(0, 60);
        var fullText = (el.textContent || "").trim().slice(0, 60);
        var rawText = directText || (el.children.length === 0 ? fullText : "");
        var infoFullText = (directText || (el.children.length === 0 ? fullText : "")).slice(0, 200);
        var info = {
          sectionIndex: sectionIndex,
          tag: tag,
          text: rawText,
          fullText: infoFullText,
          textNormalized: rawText.toLowerCase().replace(/\\s+/g, " ").replace(/['']/g, "'").replace(/[""]/g, '"').trim(),
          depth: depth,
          childIndex: childIndex,
          path: path + " > " + tag + "[" + childIndex + "]",
          relativeX: Math.round(rect.left - sectionRect.left),
          relativeY: Math.round(rect.top - sectionRect.top),
          t1Styles: t1Styles,
          t2Styles: t2Styles,
          animationStyles: animationStyles,
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
        if (tag === "img") { info.src = el.getAttribute("src") || ""; info.alt = el.getAttribute("alt") || ""; }
        if (tag === "a") { info.href = el.getAttribute("href") || ""; }
        results.push(info);
        for (var ci = el.children.length - 1; ci >= 0; ci--) {
          stack.push({ el: el.children[ci], depth: depth + 1, childIndex: ci, path: info.path });
        }
      }
    }
    return results;
  })()`)
}

// --- Element Matching ---

function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.7
  const bigramsA = new Set<string>()
  const bigramsB = new Set<string>()
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2))
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.slice(i, i + 2))
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0
  let intersection = 0
  for (const bg of bigramsA) if (bigramsB.has(bg)) intersection++
  return (2 * intersection) / (bigramsA.size + bigramsB.size)
}

function bboxIoU(a: ElementInfo, b: ElementInfo): number {
  const ax1 = a.relativeX, ay1 = a.relativeY, ax2 = a.relativeX + a.width, ay2 = a.relativeY + a.height
  const bx1 = b.relativeX, by1 = b.relativeY, bx2 = b.relativeX + b.width, by2 = b.relativeY + b.height
  const ix1 = Math.max(ax1, bx1), iy1 = Math.max(ay1, by1)
  const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2)
  if (ix2 <= ix1 || iy2 <= iy1) return 0
  const intersectionArea = (ix2 - ix1) * (iy2 - iy1)
  const areaA = a.width * a.height
  const areaB = b.width * b.height
  const union = areaA + areaB - intersectionArea
  return union > 0 ? intersectionArea / union : 0
}

function scoreMatch(ref: ElementInfo, local: ElementInfo): number {
  if (ref.sectionIndex !== local.sectionIndex) return 0

  let score = 0

  const textSim = textSimilarity(ref.textNormalized, local.textNormalized)
  if (textSim === 1) score += 10
  else if (textSim >= 0.8) score += 7
  else if (textSim >= 0.5) score += 5

  const iou = bboxIoU(ref, local)
  if (iou > 0.5) score += 8
  if (Math.abs(ref.relativeY - local.relativeY) < 20) score += 5
  if (Math.abs(ref.relativeX - local.relativeX) < 20) score += 3

  if (ref.tag === local.tag) score += 3
  if (ref.width > 0 && local.width > 0 && Math.abs(ref.width - local.width) / ref.width < 0.1) score += 2
  if (ref.height > 0 && local.height > 0 && Math.abs(ref.height - local.height) / ref.height < 0.1) score += 2

  return score
}

const MATCH_THRESHOLD = 8

function matchElements(refElements: ElementInfo[], localElements: ElementInfo[]): {
  matched: MatchedPair[]
  unmatched: UnmatchedElement[]
} {
  const candidates: { refIdx: number; localIdx: number; score: number }[] = []

  for (let ri = 0; ri < refElements.length; ri++) {
    for (let li = 0; li < localElements.length; li++) {
      const score = scoreMatch(refElements[ri], localElements[li])
      if (score >= MATCH_THRESHOLD) {
        candidates.push({ refIdx: ri, localIdx: li, score })
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score)

  const usedRef = new Set<number>()
  const usedLocal = new Set<number>()
  const matched: MatchedPair[] = []

  for (const c of candidates) {
    if (usedRef.has(c.refIdx) || usedLocal.has(c.localIdx)) continue
    const ref = refElements[c.refIdx]
    const local = localElements[c.localIdx]

    const textSim = textSimilarity(ref.textNormalized, local.textNormalized)
    const matchType: "text" | "position" | "image" =
      textSim >= 0.5 ? "text" :
      ref.tag === "img" && local.tag === "img" ? "image" :
      "position"

    matched.push({ ref, local, matchType, score: c.score })
    usedRef.add(c.refIdx)
    usedLocal.add(c.localIdx)
  }

  const unmatched: UnmatchedElement[] = []
  for (let ri = 0; ri < refElements.length; ri++) {
    if (!usedRef.has(ri)) {
      const el = refElements[ri]
      if (el.text || el.tag === "img") {
        unmatched.push({ element: el, site: "reference" })
      }
    }
  }

  return { matched, unmatched }
}

// --- Diff Generation ---

const TOLERANCES: Record<string, number> = {
  fontSize: 0, fontWeight: 0, lineHeight: 1,
  paddingTop: 2, paddingRight: 2, paddingBottom: 2, paddingLeft: 2,
  gap: 2, borderRadius: 1, borderWidth: 0, opacity: 0.02,
}

const EQUIVALENCES: Record<string, Record<string, string>> = {
  textAlign: { start: "left", end: "right" },
}

const SNAP_VALUES = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 96, 112, 128, 160]

function roundValue(value: string): string {
  const px = parseFloat(value)
  if (isNaN(px)) return value
  const rounded = Math.round(px)
  for (const snap of SNAP_VALUES) {
    if (Math.abs(rounded - snap) <= 2) return `${snap}px`
  }
  return `${rounded}px`
}

function withinTolerance(prop: string, refVal: string, localVal: string): boolean {
  const tolerance = TOLERANCES[prop]
  if (tolerance === undefined) return false
  const refNum = parseFloat(refVal)
  const localNum = parseFloat(localVal)
  if (isNaN(refNum) || isNaN(localNum)) return refVal === localVal
  return Math.abs(refNum - localNum) <= tolerance
}

function normalizeEquivalence(prop: string, value: string): string {
  const equiv = EQUIVALENCES[prop]
  if (!equiv) return value
  return equiv[value] || value
}

function colorsWithinTolerance(a: string, b: string): boolean {
  const parseRgb = (s: string) => {
    const m = s.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
    return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null
  }
  const rgbA = parseRgb(a)
  const rgbB = parseRgb(b)
  if (!rgbA || !rgbB) return a === b
  return Math.abs(rgbA[0] - rgbB[0]) <= 3 &&
         Math.abs(rgbA[1] - rgbB[1]) <= 3 &&
         Math.abs(rgbA[2] - rgbB[2]) <= 3
}

function fontsMatch(a: string, b: string): boolean {
  const first = (s: string) => s.split(",")[0].trim().replace(/['"]/g, "").toLowerCase()
  return first(a) === first(b)
}

function generateFindClass(prop: string, localValue: string, mapper: ReturnType<typeof createMapper>): string {
  const styles = { [prop]: localValue }
  const mapped = mapper.mapStyles(styles).trim()
  if (!mapped) return ""
  const alternatives: string[] = [mapped]
  if (prop === "fontSize") {
    const px = parseFloat(localValue)
    if (px === 16) alternatives.push("text-base")
    if (px === 14) alternatives.push("text-sm")
    if (px === 18) alternatives.push("text-lg")
    if (px === 12) alternatives.push("text-xs")
    if (px === 20) alternatives.push("text-xl")
    if (px === 24) alternatives.push("text-2xl")
  }
  if (prop === "fontWeight") {
    const w = localValue
    if (w === "400") alternatives.push("font-normal")
    if (w === "500") alternatives.push("font-medium")
    if (w === "600") alternatives.push("font-semibold")
    if (w === "700") alternatives.push("font-bold")
  }
  return alternatives.filter(Boolean).join("  OR  ")
}

function generateFix(property: string, refValue: string, mapper: ReturnType<typeof createMapper>): string {
  const styles = { [property]: refValue }
  const mapped = mapper.mapStyles(styles)
  if (mapped) return `Use: ${mapped}`
  return `Set ${property} to ${refValue}`
}

function diffMatchedPair(pair: MatchedPair, mapper: ReturnType<typeof createMapper>): ElementDiff | null {
  // Tier 1 diffs (auto-fix)
  const t1Diffs: PropertyDiff[] = []
  const allT1Props = new Set([...Object.keys(pair.ref.t1Styles), ...Object.keys(pair.local.t1Styles)])
  for (const prop of allT1Props) {
    let refVal = pair.ref.t1Styles[prop] || ""
    let localVal = pair.local.t1Styles[prop] || ""
    if (!refVal && !localVal) continue

    refVal = normalizeEquivalence(prop, refVal)
    localVal = normalizeEquivalence(prop, localVal)
    if (refVal === localVal) continue

    if (prop === "fontFamily" && fontsMatch(refVal, localVal)) continue
    if ((prop === "color" || prop === "backgroundColor") && colorsWithinTolerance(refVal, localVal)) continue
    if (withinTolerance(prop, refVal, localVal)) continue

    // borderColor: only flag if borderWidth > 0
    if (prop === "borderColor") {
      const refBW = pair.ref.t1Styles.borderWidth || "0px"
      if (refBW === "0px" || refBW === "0") continue
    }

    const roundedRef = roundValue(refVal)
    const suggestedFix = generateFix(prop, roundedRef, mapper)
    const findClass = generateFindClass(prop, localVal, mapper)

    t1Diffs.push({
      property: prop,
      refValue: roundedRef,
      localValue: localVal,
      suggestedFix: findClass ? `FIND: ${findClass}\n  REPLACE: ${suggestedFix}` : suggestedFix
    })
  }

  const animDiffs: PropertyDiff[] = []
  const allAnimProps = new Set([...Object.keys(pair.ref.animationStyles), ...Object.keys(pair.local.animationStyles)])
  for (const prop of allAnimProps) {
    let refVal = pair.ref.animationStyles[prop] || ""
    let localVal = pair.local.animationStyles[prop] || ""
    if (refVal === localVal) continue
    animDiffs.push({ property: prop, refValue: refVal, localValue: localVal, suggestedFix: `Set ${prop} to ${refVal}` })
  }

  const imgDiffs: PropertyDiff[] = []
  if (pair.ref.tag === "img") {
    if (pair.ref.src !== pair.local.src) {
      imgDiffs.push({ property: "src", refValue: pair.ref.src || "", localValue: pair.local.src || "", suggestedFix: "Update src" })
    }
    if (pair.ref.width !== pair.local.width) {
      imgDiffs.push({ property: "width", refValue: String(pair.ref.width), localValue: String(pair.local.width), suggestedFix: `Set width={${pair.ref.width}}` })
    }
    if (pair.ref.height !== pair.local.height) {
      imgDiffs.push({ property: "height", refValue: String(pair.ref.height), localValue: String(pair.local.height), suggestedFix: `Set height={${pair.ref.height}}` })
    }
  }

  const textDiffs: PropertyDiff[] = []
  if (pair.ref.fullText && pair.local.fullText &&
      pair.ref.fullText !== pair.local.fullText &&
      pair.ref.fullText.length > 2) {
    textDiffs.push({
      property: "textContent",
      refValue: pair.ref.fullText,
      localValue: pair.local.fullText,
      suggestedFix: `Replace text with: "${pair.ref.fullText}"`
    })
  }

  // Tier 2 diffs (layout intent — no pixel values)
  const t2Diffs: PropertyDiff[] = []
  const allT2Props = new Set([...Object.keys(pair.ref.t2Styles), ...Object.keys(pair.local.t2Styles)])
  for (const prop of allT2Props) {
    let refVal = normalizeEquivalence(prop, pair.ref.t2Styles[prop] || "")
    let localVal = normalizeEquivalence(prop, pair.local.t2Styles[prop] || "")
    if (refVal === localVal) continue
    if (!refVal && !localVal) continue

    const intentMap: Record<string, (ref: string, local: string) => string> = {
      justifyContent: (r, l) => `Reference aligns content as ${r}. Local uses ${l}. Adjust the flex container alignment — do NOT apply pixel widths.`,
      alignItems: (r, l) => `Reference aligns items as ${r}. Local uses ${l}. Adjust the flex/grid item alignment.`,
      flexDirection: (r, l) => `Reference uses ${r} layout. Local uses ${l}. Check if the container direction should change.`,
      display: (r, l) => `Reference uses display:${r}. Local uses display:${l}. Check if the display type should change.`,
      overflow: (r, l) => `Reference has overflow:${r}. Local has overflow:${l}. This may cause content to be cut off or overflow.`,
      textAlign: (r, l) => `Reference aligns text ${r}. Local aligns text ${l}.`,
    }

    const intentFn = intentMap[prop]
    const intent = intentFn ? intentFn(refVal, localVal) : `${prop}: reference=${refVal}, local=${localVal}`

    t2Diffs.push({
      property: prop,
      refValue: refVal,
      localValue: localVal,
      suggestedFix: intent + "\nUse Playwright MCP to verify visually after fixing."
    })
  }

  const allDiffs = [...textDiffs, ...t1Diffs, ...imgDiffs, ...animDiffs, ...t2Diffs]
  if (allDiffs.length === 0) return null

  // Mark tiers
  for (const d of textDiffs) (d as any).tier = 3
  for (const d of t1Diffs) (d as any).tier = 1
  for (const d of imgDiffs) (d as any).tier = 3
  for (const d of animDiffs) (d as any).tier = 2
  for (const d of t2Diffs) (d as any).tier = 2

  const identifier = pair.ref.text
    ? `${pair.ref.tag} "${pair.ref.text}"`
    : `${pair.ref.tag} (${pair.matchType} match, depth ${pair.ref.depth}, child ${pair.ref.childIndex})`

  return {
    type: textDiffs.length > 0 ? "text" : animDiffs.length > 0 ? "animation" : imgDiffs.length > 0 ? "image" : "static",
    element: identifier,
    matchType: pair.matchType,
    sectionIndex: pair.ref.sectionIndex,
    diffs: allDiffs,
    score: pair.score,
  }
}

// --- Animation Trigger Comparison ---

async function compareAnimationTriggers(
  refPage: Page,
  localPage: Page
): Promise<ElementDiff[]> {
  const diffs: ElementDiff[] = []

  async function recordTriggers(page: Page): Promise<Map<string, number>> {
    const triggers = new Map<string, number>()
    const height = await page.evaluate(() => document.body.scrollHeight)

    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(500)

    const initial: { text: string; opacity: string }[] = await page.evaluate(`(() => {
      var results = [];
      var all = document.querySelectorAll("*");
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var text = (el.textContent || "").trim().slice(0, 40);
        if (!text || el.children.length > 3) continue;
        results.push({ text: text, opacity: getComputedStyle(el).opacity });
      }
      return results;
    })()`)

    const hidden = new Set(initial.filter(e => e.opacity === "0").map(e => e.text))

    for (let y = 0; y < height; y += 100) {
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y)
      await page.waitForTimeout(150)

      const textsJson = JSON.stringify([...hidden])
      const current: { text: string; opacity: string }[] = await page.evaluate(`((texts) => {
        var results = [];
        var all = document.querySelectorAll("*");
        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          var text = (el.textContent || "").trim().slice(0, 40);
          if (texts.indexOf(text) >= 0) {
            results.push({ text: text, opacity: getComputedStyle(el).opacity });
          }
        }
        return results;
      })(${textsJson})`)

      for (const el of current) {
        if (el.opacity !== "0" && hidden.has(el.text) && !triggers.has(el.text)) {
          triggers.set(el.text, y)
          hidden.delete(el.text)
        }
      }
    }

    return triggers
  }

  const refTriggers = await recordTriggers(refPage)
  const localTriggers = await recordTriggers(localPage)

  for (const [text, refScroll] of refTriggers) {
    const localScroll = localTriggers.get(text)
    if (localScroll === undefined) {
      diffs.push({
        type: "animation",
        element: `"${text}" (entrance animation)`,
        matchType: "text",
        sectionIndex: -1,
        diffs: [{
          property: "entrance-animation",
          refValue: `fires at scroll ${refScroll}px`,
          localValue: "MISSING — no entrance animation",
          suggestedFix: `Add motion.div with whileInView, viewport={{ once: true, amount: 0.2 }}, transition={{ duration: 0.6, ease: "easeOut" }}`
        }]
      })
    } else if (Math.abs(refScroll - localScroll) > 200) {
      diffs.push({
        type: "animation",
        element: `"${text}" (entrance timing)`,
        matchType: "text",
        sectionIndex: -1,
        diffs: [{
          property: "trigger-scroll-position",
          refValue: `${refScroll}px`,
          localValue: `${localScroll}px`,
          suggestedFix: "Adjust viewport.amount on whileInView"
        }]
      })
    }
  }

  return diffs
}

// --- Main ---

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const mapper = createMapper(".")

  console.log(`Rendered diff: ${REFERENCE_URL} vs ${LOCAL_URL}\n`)

  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })

  const refPage = await context.newPage()
  await refPage.goto(REFERENCE_URL, { waitUntil: "domcontentloaded", timeout: 30000 })
  await dismissCookies(refPage, freezeOpts)

  const localPage = await context.newPage()
  await localPage.goto(LOCAL_URL, { waitUntil: "domcontentloaded", timeout: 30000 })
  await dismissCookies(localPage, freezeOpts)
  await localPage.reload({ waitUntil: "domcontentloaded" })

  // Compare animation triggers BEFORE freezing
  console.log("Comparing animation triggers...")
  const animTriggerDiffs = await compareAnimationTriggers(refPage, localPage)
  console.log(`  ${animTriggerDiffs.length} animation trigger diffs`)

  // Re-navigate and freeze for static comparison
  await refPage.goto(REFERENCE_URL, { waitUntil: "domcontentloaded", timeout: 30000 })
  await dismissCookies(refPage, freezeOpts)
  await freezeDynamicContent(refPage, freezeOpts)

  await localPage.goto(LOCAL_URL, { waitUntil: "domcontentloaded", timeout: 30000 })
  await dismissCookies(localPage, freezeOpts)
  await localPage.reload({ waitUntil: "domcontentloaded" })
  await freezeDynamicContent(localPage, freezeOpts)

  // Walk elements on both sites
  console.log("Walking elements...")
  const refElements = await walkElements(refPage)
  const localElements = await walkElements(localPage)
  console.log(`  Reference: ${refElements.length} elements`)
  console.log(`  Local: ${localElements.length} elements`)

  // Match and diff
  const { matched, unmatched } = matchElements(refElements, localElements)
  console.log(`  Matched: ${matched.length} pairs`)
  console.log(`  Unmatched: ${unmatched.length} elements`)

  const allDiffs: ElementDiff[] = [...animTriggerDiffs]

  for (const pair of matched) {
    const diff = diffMatchedPair(pair, mapper)
    if (diff) allDiffs.push(diff)
  }

  for (const um of unmatched) {
    if (um.site === "reference") {
      allDiffs.push({
        type: "missing",
        element: um.element.text ? `${um.element.tag} "${um.element.text}"` : `${um.element.tag} (depth ${um.element.depth})`,
        matchType: "none",
        sectionIndex: um.element.sectionIndex,
        diffs: [{
          property: "element",
          refValue: "EXISTS",
          localValue: "MISSING",
          suggestedFix: `Add ${um.element.tag} element with text "${um.element.text}"`
        }]
      })
    }
  }

  // Animation cross-reference: check spec vs component source
  const sectionIndices = new Set(refElements.map(e => e.sectionIndex))
  for (const si of sectionIndices) {
    const animDiff = checkAnimationCrossRef(si)
    if (animDiff) allDiffs.push(animDiff)
  }

  // --- Format helpers ---
  function formatDiffByTier(diff: ElementDiff): { t1: string; t2: string; t3: string } {
    const result = { t1: "", t2: "", t3: "" }
    const header = `**${diff.element}**` + (diff.score ? ` (score: ${diff.score})` : "") + "\n"

    const t1Props = diff.diffs.filter((d: any) => d.tier === 1)
    const t2Props = diff.diffs.filter((d: any) => d.tier === 2)
    const t3Props = diff.diffs.filter((d: any) => d.tier === 3)

    if (t1Props.length > 0) {
      result.t1 = header
      for (const d of t1Props) {
        result.t1 += `- **${d.property}:** \`${d.localValue}\` → \`${d.refValue}\`\n`
        result.t1 += `  - ${d.suggestedFix}\n`
      }
      result.t1 += "\n"
    }

    if (t2Props.length > 0) {
      result.t2 = header
      for (const d of t2Props) {
        result.t2 += `- **${d.property}:** ${d.suggestedFix}\n`
      }
      result.t2 += "\n"
    }

    if (t3Props.length > 0) {
      result.t3 = header
      for (const d of t3Props) {
        if (d.property === "textContent") {
          result.t3 += `- **TEXT:** local has \`${d.localValue.slice(0, 60)}...\`\n`
          result.t3 += `  - REPLACE WITH: "${d.refValue}"\n`
        } else {
          result.t3 += `- **${d.property}:** \`${d.localValue}\` → \`${d.refValue}\`\n`
          result.t3 += `  - ${d.suggestedFix}\n`
        }
      }
      result.t3 += "\n"
    }

    return result
  }

  // --- Group by section ---
  const sections = new Map<number, ElementDiff[]>()
  for (const diff of allDiffs) {
    const list = sections.get(diff.sectionIndex) || []
    list.push(diff)
    sections.set(diff.sectionIndex, list)
  }

  const matchRate = Math.round(matched.length / refElements.length * 100)
  const summaryRows: string[] = []

  // --- Write per-section diff files ---
  for (const [sectionIdx, batch] of [...sections.entries()].sort((a, b) => a[0] - b[0])) {
    const meta = SECTION_META[sectionIdx] || { name: `section-${sectionIdx}`, file: "unknown" }
    const nn = String(sectionIdx).padStart(2, "0")
    const fileName = `${nn}-${meta.name}.diff.md`

    // Collect formatted diffs per tier
    let t3Block = ""
    let t1Block = ""
    let t2Block = ""
    let t1Count = 0, t2Count = 0, t3Count = 0

    for (const diff of batch) {
      if (diff.type === "missing") continue
      const formatted = formatDiffByTier(diff)
      if (formatted.t3) { t3Block += formatted.t3; t3Count++ }
      if (formatted.t1) { t1Block += formatted.t1; t1Count++ }
      if (formatted.t2) { t2Block += formatted.t2; t2Count++ }
    }

    const unmatchedDiffs = batch.filter(d => d.type === "missing")
    let unmatchedBlock = ""
    for (const diff of unmatchedDiffs) {
      unmatchedBlock += `- ${diff.element}\n`
    }

    let md = `# ${meta.name} — Visual Parity Diffs\n\n`
    md += `**Section:** ${sectionIdx} (${meta.name})\n`
    md += `**Component:** \`${meta.file}\`\n`
    md += `**Page:** ${PAGE_NAME}\n`
    md += `**Reference:** ${REFERENCE_URL}\n\n`
    md += `**Invoke vercel-react-best-practices before writing any code.**\n\n`
    md += `${MIGRATION_RULES}\n\n---\n\n`

    if (t3Block) md += `## T3-CONTENT — fix these FIRST (copy text exactly, add missing elements)\n\n${t3Block}`
    if (t1Block) md += `## T1-AUTO — apply these EXACTLY (mechanical class changes)\n\n${t1Block}`
    if (t2Block) md += `## T2-LAYOUT — use visual judgment (DO NOT apply pixel values)\n\n${t2Block}`
    if (unmatchedBlock) md += `## UNMATCHED — lower priority\n\n${unmatchedBlock}\n`

    writeFileSync(join(OUTPUT_DIR, fileName), md)
    console.log(`  ${fileName}: T3=${t3Count} T1=${t1Count} T2=${t2Count} unmatched=${unmatchedDiffs.length}`)

    summaryRows.push(`| ${meta.name} | \`${meta.file}\` | ${t3Count} | ${t1Count} | ${t2Count} | ${unmatchedDiffs.length} | ${t3Count + t1Count + t2Count + unmatchedDiffs.length} |`)
  }

  // --- Write summary.md ---
  let summary = `# Diff Summary — ${PAGE_NAME}\n\n`
  summary += `**Reference:** ${REFERENCE_URL}\n`
  summary += `**Local:** ${LOCAL_URL}\n`
  summary += `**Generated:** ${new Date().toISOString()}\n`
  summary += `**Matched:** ${matched.length} pairs (of ${refElements.length} ref / ${localElements.length} local)\n`
  summary += `**Match rate:** ${matchRate}%\n\n`
  summary += `| Section | Component | T3 | T1 | T2 | Unmatched | Total |\n`
  summary += `|---------|-----------|----|----|----|-----------|---------|\n`
  summary += summaryRows.join(`\n`) + `\n`

  writeFileSync(join(OUTPUT_DIR, "summary.md"), summary)
  writeFileSync(join(OUTPUT_DIR, "rendered-diffs.json"), JSON.stringify(allDiffs, null, 2))

  console.log(`\nSummary written to ${OUTPUT_DIR}/summary.md`)
  console.log(`  Match rate: ${matchRate}%`)

  await browser.close()
}

main().catch(console.error)
