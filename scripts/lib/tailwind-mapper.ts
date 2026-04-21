import { readFileSync } from "fs"
import { join } from "path"

interface TokenMap {
  colors: Map<string, string>
  fonts: Map<string, string>
}

function hexToRgb(hex: string): string | null {
  hex = hex.replace("#", "")
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("")
  if (hex.length !== 6) return null
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgb(${r}, ${g}, ${b})`
}

function discoverColorTokens(globalsPath: string): Map<string, string> {
  const colorMap = new Map<string, string>()
  try {
    const css = readFileSync(globalsPath, "utf-8")
    const regex = /--color-([\w-]+):\s*(#[0-9A-Fa-f]{3,8});/g
    let match
    while ((match = regex.exec(css)) !== null) {
      const tokenName = match[1]
      const hex = match[2].toUpperCase()
      const rgb = hexToRgb(hex)
      if (rgb) {
        colorMap.set(rgb, tokenName)
        colorMap.set(hex.toLowerCase(), tokenName)
      }
    }
  } catch {}
  colorMap.set("rgb(255, 255, 255)", "white")
  colorMap.set("rgb(0, 0, 0)", "black")
  return colorMap
}

function discoverFontTokens(layoutPath: string): Map<string, string> {
  const fontMap = new Map<string, string>()
  try {
    const src = readFileSync(layoutPath, "utf-8")
    const importRegex = /(\w+)\s*=\s*(\w+)\(\{[^}]*variable:\s*"--font-([\w-]+)"/g
    let match
    while ((match = importRegex.exec(src)) !== null) {
      const fontConstructor = match[2]
      const cssVar = match[3]
      const familyName = fontConstructor.replace(/_/g, " ")
      const twClass = cssVar === "body" ? "font-sans" : `font-${cssVar}`
      fontMap.set(familyName.toLowerCase(), twClass)
    }
  } catch {}
  return fontMap
}

const SPACING_MAP: Record<number, string> = {
  0: "0", 1: "px", 2: "0.5", 4: "1", 6: "1.5", 8: "2", 10: "2.5",
  12: "3", 14: "3.5", 16: "4", 20: "5", 24: "6", 28: "7", 32: "8",
  36: "9", 40: "10", 44: "11", 48: "12", 56: "14", 64: "16",
  72: "18", 80: "20", 96: "24",
}

const FONT_WEIGHT_MAP: Record<string, string> = {
  "100": "font-thin", "200": "font-extralight", "300": "font-light",
  "400": "font-normal", "500": "font-medium", "600": "font-semibold",
  "700": "font-bold", "800": "font-extrabold", "900": "font-black",
}

const BORDER_RADIUS_MAP: Record<string, string> = {
  "0px": "", "2px": "rounded-sm", "4px": "rounded", "6px": "rounded-md",
  "8px": "rounded-lg", "12px": "rounded-xl", "16px": "rounded-2xl",
  "24px": "rounded-3xl", "10000px": "rounded-full", "9999px": "rounded-full",
}

function splitTailwindClasses(str: string): string[] {
  let normalized = ""
  let depth = 0
  for (const ch of str) {
    if (ch === "[") depth++
    else if (ch === "]") depth--
    if (depth > 0 && ch === " ") continue
    normalized += ch
  }
  return normalized.split(" ").filter(Boolean)
}

export class TailwindMapper {
  private tokens: TokenMap

  constructor(tokens: TokenMap) {
    this.tokens = tokens
  }

  mapColor(value: string, prefix: "text" | "bg" | "border"): string {
    if (value === "rgba(0, 0, 0, 0)" || value === "transparent") return ""

    const normalized = value.replace(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/, "rgb($1, $2, $3)")

    const token = this.tokens.colors.get(normalized)
    if (token) {
      if (token === "white") return `${prefix}-white`
      if (token === "black") return `${prefix}-black`
      return `${prefix}-${token}`
    }

    return `${prefix}-[${value}]`
  }

  mapFont(fontFamily: string): string {
    const lower = fontFamily.toLowerCase()
    for (const [family, twClass] of this.tokens.fonts) {
      if (lower.includes(family)) return twClass
    }
    return ""
  }

  mapSpacing(value: string, prefix: string): string {
    const px = parseFloat(value)
    if (isNaN(px)) return ""
    if (px === 0) return `${prefix}-0`

    const utility = SPACING_MAP[px]
    if (utility) return `${prefix}-${utility}`

    return `${prefix}-[${value}]`
  }

  mapStyles(styles: Record<string, string>): string {
    const classes: string[] = []

    if (styles.fontFamily) {
      const fc = this.mapFont(styles.fontFamily)
      if (fc) classes.push(fc)
    }

    if (styles.fontSize) classes.push(`text-[${styles.fontSize}]`)

    if (styles.fontWeight && FONT_WEIGHT_MAP[styles.fontWeight]) {
      classes.push(FONT_WEIGHT_MAP[styles.fontWeight])
    }

    if (styles.lineHeight) classes.push(`leading-[${styles.lineHeight}]`)

    if (styles.letterSpacing && styles.letterSpacing !== "normal") {
      classes.push(`tracking-[${styles.letterSpacing}]`)
    }

    if (styles.textTransform === "uppercase") classes.push("uppercase")
    if (styles.textTransform === "lowercase") classes.push("lowercase")
    if (styles.textTransform === "capitalize") classes.push("capitalize")

    if (styles.textAlign === "center") classes.push("text-center")
    if (styles.textAlign === "right") classes.push("text-right")

    if (styles.textDecoration?.includes("underline")) classes.push("underline")
    if (styles.textDecoration?.includes("line-through")) classes.push("line-through")

    if (styles.color) {
      const c = this.mapColor(styles.color, "text")
      if (c) classes.push(c)
    }
    if (styles.backgroundColor) {
      const c = this.mapColor(styles.backgroundColor, "bg")
      if (c) classes.push(c)
    }
    if (styles.borderColor) {
      const c = this.mapColor(styles.borderColor, "border")
      if (c) classes.push(c)
    }

    if (styles.paddingTop) classes.push(this.mapSpacing(styles.paddingTop, "pt"))
    if (styles.paddingRight) classes.push(this.mapSpacing(styles.paddingRight, "pr"))
    if (styles.paddingBottom) classes.push(this.mapSpacing(styles.paddingBottom, "pb"))
    if (styles.paddingLeft) classes.push(this.mapSpacing(styles.paddingLeft, "pl"))
    if (styles.marginTop) classes.push(this.mapSpacing(styles.marginTop, "mt"))
    if (styles.marginRight) classes.push(this.mapSpacing(styles.marginRight, "mr"))
    if (styles.marginBottom) classes.push(this.mapSpacing(styles.marginBottom, "mb"))
    if (styles.marginLeft) classes.push(this.mapSpacing(styles.marginLeft, "ml"))

    if (styles.display === "flex") classes.push("flex")
    if (styles.display === "grid") classes.push("grid")
    if (styles.display === "inline-flex") classes.push("inline-flex")
    if (styles.display === "inline") classes.push("inline")
    if (styles.display === "inline-block") classes.push("inline-block")
    if (styles.display === "none") classes.push("hidden")

    if (styles.flexDirection === "column") classes.push("flex-col")
    if (styles.flexDirection === "column-reverse") classes.push("flex-col-reverse")
    if (styles.flexDirection === "row-reverse") classes.push("flex-row-reverse")

    if (styles.justifyContent === "center") classes.push("justify-center")
    if (styles.justifyContent === "space-between") classes.push("justify-between")
    if (styles.justifyContent === "flex-start") classes.push("justify-start")
    if (styles.justifyContent === "flex-end") classes.push("justify-end")

    if (styles.alignItems === "center") classes.push("items-center")
    if (styles.alignItems === "flex-start") classes.push("items-start")
    if (styles.alignItems === "flex-end") classes.push("items-end")
    if (styles.alignItems === "stretch") classes.push("items-stretch")

    if (styles.flexWrap === "wrap") classes.push("flex-wrap")

    if (styles.gap) classes.push(this.mapSpacing(styles.gap, "gap"))
    if (styles.rowGap) classes.push(this.mapSpacing(styles.rowGap, "gap-y"))
    if (styles.columnGap) classes.push(this.mapSpacing(styles.columnGap, "gap-x"))

    if (styles.gridTemplateColumns && styles.gridTemplateColumns !== "none") {
      classes.push(`grid-cols-[${styles.gridTemplateColumns.replace(/ /g, "_")}]`)
    }
    if (styles.gridColumn && styles.gridColumn !== "auto") {
      classes.push(`col-[${styles.gridColumn}]`)
    }
    if (styles.gridRow && styles.gridRow !== "auto") {
      classes.push(`row-[${styles.gridRow}]`)
    }

    if (styles.maxWidth && styles.maxWidth !== "none") {
      classes.push(`max-w-[${styles.maxWidth}]`)
    }
    if (styles.width && styles.width !== "auto") {
      if (styles.width === "100%") classes.push("w-full")
      else classes.push(`w-[${styles.width}]`)
    }
    if (styles.height && styles.height !== "auto") {
      if (styles.height === "100%") classes.push("h-full")
      else classes.push(`h-[${styles.height}]`)
    }

    if (styles.borderRadius) {
      const mapped = BORDER_RADIUS_MAP[styles.borderRadius]
      if (mapped !== undefined) { if (mapped) classes.push(mapped) }
      else classes.push(`rounded-[${styles.borderRadius}]`)
    }
    if (styles.borderWidth && styles.borderWidth !== "0px") {
      if (styles.borderWidth === "1px") classes.push("border")
      else if (styles.borderWidth === "2px") classes.push("border-2")
      else classes.push(`border-[${styles.borderWidth}]`)
    }

    if (styles.position === "relative") classes.push("relative")
    if (styles.position === "absolute") classes.push("absolute")
    if (styles.position === "fixed") classes.push("fixed")
    if (styles.position === "sticky") classes.push("sticky")

    if (styles.zIndex && styles.zIndex !== "auto") classes.push(`z-[${styles.zIndex}]`)

    if (styles.overflow === "hidden") classes.push("overflow-hidden")
    if (styles.overflowX === "hidden" && styles.overflow !== "hidden") classes.push("overflow-x-hidden")
    if (styles.overflowY === "hidden" && styles.overflow !== "hidden") classes.push("overflow-y-hidden")

    if (styles.opacity && styles.opacity !== "1") {
      const pct = Math.round(parseFloat(styles.opacity) * 100)
      classes.push(`opacity-${pct}`)
    }

    return classes.filter(Boolean).join(" ")
  }

  cleanClasses(classes: string, el: { tag: string; className: string; bounds: { width: number; height: number } }): string {
    const MEDIA_TAGS = new Set(["img", "svg", "video", "canvas", "iframe", "picture", "source"])
    const isMedia = MEDIA_TAGS.has(el.tag)
    const isPixelWidth = (cls: string) => /^(\w+:)*w-\[\d/.test(cls)
    const isPixelHeight = (cls: string) => /^(\w+:)*h-\[\d/.test(cls)

    return splitTailwindClasses(classes)
      .filter(cls => {
        // Strip inherited border color (comes from body)
        if (cls === "border-neutral-800" || cls === "border-neutral-900") return false
        // Strip default border style
        if (cls === "border-solid") return false
        // Strip pixel width/height on non-media elements
        if (!isMedia && isPixelWidth(cls)) return false
        if (!isMedia && isPixelHeight(cls) && !el.className.includes("spacer")) return false
        return true
      })
      .join(" ")
  }

  mapMultiViewportStyles(
    viewportStyles: Map<number, Record<string, string>>,
    viewports: number[]
  ): string {
    const sortedViewports = [...viewports].sort((a, b) => a - b)
    const smallest = sortedViewports[0]
    const baseStyles = viewportStyles.get(smallest) || {}

    const classes: string[] = []
    const baseClasses = this.mapStyles(baseStyles)
    if (baseClasses) classes.push(baseClasses)

    let prevStyles = baseStyles
    for (let i = 1; i < sortedViewports.length; i++) {
      const vw = sortedViewports[i]
      const currentStyles = viewportStyles.get(vw) || {}
      const prefix = this.viewportToPrefix(vw)

      const diffStyles: Record<string, string> = {}
      for (const [prop, val] of Object.entries(currentStyles)) {
        if (val !== prevStyles[prop]) {
          diffStyles[prop] = val
        }
      }

      if (Object.keys(diffStyles).length > 0) {
        const diffClasses = this.mapStyles(diffStyles)
        const prefixed = splitTailwindClasses(diffClasses).map(c => `${prefix}:${c}`).join(" ")
        if (prefixed.trim()) classes.push(prefixed)
      }

      prevStyles = currentStyles
    }

    return classes.filter(Boolean).join(" ")
  }

  private viewportToPrefix(width: number): string {
    if (width <= 640) return "sm"
    if (width <= 768) return "md"
    if (width <= 1024) return "lg"
    return "xl"
  }
}

export function createMapper(projectRoot: string) {
  const globalsPath = join(projectRoot, "src/app/globals.css")
  const layoutPath = join(projectRoot, "src/app/layout.tsx")

  const colors = discoverColorTokens(globalsPath)
  const fonts = discoverFontTokens(layoutPath)

  return new TailwindMapper({ colors, fonts })
}
