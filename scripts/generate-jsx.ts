import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from "fs"
import { join } from "path"
import { fileURLToPath } from "url"
import { splitTailwindClasses } from "./lib/tailwind-mapper.ts"

const SPECS_DIR = process.argv[2] || "docs/specs/homepage"
const OUTPUT_DIR = process.argv[3] || "docs/generated/homepage"

// --- Structure parser ---

interface TreeNode {
  tag: string
  className: string
  attrs: Record<string, string>
  text: string
  children: TreeNode[]
}

function parseStructureTree(md: string): TreeNode | null {
  const lines = md.split("\n").filter(l => l.trim().startsWith("- "))
  if (lines.length === 0) return null

  const stack: { node: TreeNode; indent: number }[] = []

  for (const line of lines) {
    const indent = line.search(/\S/)
    const content = line.trim().replace(/^- /, "")

    const tagMatch = content.match(/^([\w.:-]+)/)
    const full = tagMatch ? tagMatch[1] : "div"
    const parts = full.split(".")
    const tag = parts[0]
    const className = parts.slice(1).join(" ")

    const attrs: Record<string, string> = {}
    const attrRegex = /\[(\w+)="([^"]+)"\]/g
    let attrMatch
    while ((attrMatch = attrRegex.exec(content)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2]
    }

    // Extract the text node — but skip past attribute values like
    // `[href="#contact"]`, otherwise the first quoted string the regex sees
    // is the href and the link renders with `#contact` as its label.
    const contentSansAttrs = content.replace(/\[[^\]]*\]/g, "")
    const textMatch = contentSansAttrs.match(/"([^"]+)"/)
    const text = textMatch ? textMatch[1] : ""

    const dimMatch = content.match(/\((\d+)x(\d+)\)/)
    if (dimMatch) {
      attrs._width = dimMatch[1]
      attrs._height = dimMatch[2]
    }

    const node: TreeNode = { tag, className, attrs, text, children: [] }

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop()
    }

    if (stack.length > 0) {
      stack[stack.length - 1].node.children.push(node)
    }

    stack.push({ node, indent })
  }

  return stack.length > 0 ? stack[0].node : null
}

// --- Styles lookup ---

interface StyleEntry {
  selector: string
  text: string
  classes: string
  rawStyles?: Record<string, string>
  hover?: Record<string, { from: string; to: string }>
  hoverClasses?: string
}

function loadStyles(filePath: string): StyleEntry[] {
  return JSON.parse(readFileSync(filePath, "utf-8"))
}

function findStyles(entries: StyleEntry[], tag: string, className: string, text: string): StyleEntry | null {
  const selector = className ? `${tag}.${className.split(" ").filter(c => !c.startsWith("w-")).slice(0, 2).join(".")}` : tag

  // Try exact selector + text match
  let match = entries.find(e => e.selector === selector && e.text.slice(0, 20) === text.slice(0, 20))
  if (match) return match

  // Try selector only
  match = entries.find(e => e.selector === selector)
  if (match) return match

  // Try partial class match
  const firstClass = className.split(" ")[0]
  if (firstClass) {
    match = entries.find(e => e.selector.includes(firstClass))
    if (match) return match
  }

  return null
}

// --- JSX renderer ---

const VALID_TAGS = new Set([
  "section", "header", "footer", "nav", "p", "h1", "h2", "h3", "h4",
  "span", "button", "form", "ul", "ol", "li", "input", "textarea", "label",
])

const VOID_TAGS = new Set(["input", "br", "hr", "img", "meta", "link"])

function escapeJsxText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\{/g, "&#123;").replace(/\}/g, "&#125;")
}

interface InlineSvgEntry {
  localPath?: string
  alt?: string
  width?: number | string
  height?: number | string
  outerHTML?: string
}

interface SvgRenderContext {
  entries: InlineSvgEntry[]
  cursor: { i: number }
}

function renderJsx(
  node: TreeNode,
  styles: StyleEntry[],
  indent: number = 0,
  usedStyles: Set<number> = new Set(),
  specsDir: string = SPECS_DIR,
  svgContext: SvgRenderContext = { entries: [], cursor: { i: 0 } },
): string {
  const pad = "  ".repeat(indent)
  const tag = node.tag
  const styleEntry = findStyles(styles, tag, node.className, node.text)

  let classes = ""
  if (styleEntry) {
    const idx = styles.indexOf(styleEntry)
    if (!usedStyles.has(idx)) {
      classes = styleEntry.classes
      usedStyles.add(idx)
    }
  }

  // Handle images
  if (tag === "img") {
    const src = node.attrs.src || ""
    const alt = node.attrs.alt || ""
    const width = node.attrs._width || "0"
    const height = node.attrs._height || "0"
    const localSrc = mapToLocalImage(src, alt, specsDir)
    return `${pad}<Image src="${localSrc}" alt="${alt}" width={${width}} height={${height}}${classes ? ` className="${classes}"` : ""} />\n`
  }

  // Handle inline SVGs. extract-images records each inline `<svg>` in
  // the section's `image-manifest.inlineSvgs[]` in DOM order. Most of
  // these SVGs are logos/icons that use `fill="currentColor"` so the
  // color inherits from the surrounding text. Rendering them with
  // `<Image src=...>` strips that inheritance (the SVG becomes an opaque
  // raster source that defaults to black). Inline the original
  // `outerHTML` via `dangerouslySetInnerHTML` so currentColor still
  // resolves against the parent text color, and so the SVG ships without
  // a round-trip through the public/ directory. The `localPath` value is
  // kept as a fallback for cases where outerHTML is missing.
  // See docs/issues/009.
  if (tag === "svg") {
    const entry = svgContext.entries[svgContext.cursor.i++]
    if (entry?.outerHTML) {
      // SVG markup uses `width="100%" height="100%"`, so the rendered
      // size is dictated by the wrapping span. If extract-styles didn't
      // produce a className for this SVG, fall back to the manifest's
      // pixel width/height — otherwise icons inflate to fill flex space
      // (e.g. a 16×16 chevron renders at 174×174). `inline-block` keeps
      // the span sized to its own box.
      const sizeClass = classes
        ? classes
        : entry.width && entry.height
          ? `inline-block w-[${entry.width}px] h-[${entry.height}px]`
          : ""
      const html = JSON.stringify(entry.outerHTML)
      const classAttr = sizeClass ? ` className="${sizeClass}"` : ""
      return `${pad}<span aria-hidden="true"${classAttr} dangerouslySetInnerHTML={{ __html: ${html} }} />\n`
    }
    if (entry?.localPath) {
      const alt = entry.alt ? escapeJsxText(entry.alt) : ""
      const width = entry.width ?? 24
      const height = entry.height ?? 24
      return `${pad}<Image src="/${entry.localPath}" alt="${alt}" width={${width}} height={${height}}${classes ? ` className="${classes}"` : ""} />\n`
    }
    return `${pad}<span aria-hidden="true"${classes ? ` className="${classes}"` : ""} />\n`
  }

  // Handle links
  if (tag === "a") {
    const href = node.attrs.href || "#"
    // Hover classes can contain spaces inside `[rgb(...)]`; a naïve `.split(" ")`
    // here turns `bg-[rgb(168, 226, 112)]` into three tokens which then get
    // each prefixed with `hover:` (the dreaded `hover:bg-[rgb(168, hover:226,
    // hover:112)]`). Use the bracket-aware splitter so RGB values stay intact.
    const hoverClasses = styleEntry?.hoverClasses
      ? " " + splitTailwindClasses(styleEntry.hoverClasses).map(c => `hover:${c}`).join(" ") + " transition-all duration-[275ms]"
      : ""
    const allClasses = (classes + hoverClasses).trim()

    if (node.children.length === 0 && node.text) {
      return `${pad}<a href="${href}"${allClasses ? ` className="${allClasses}"` : ""}>${escapeJsxText(node.text)}</a>\n`
    }

    let jsx = `${pad}<a href="${href}"${allClasses ? ` className="${allClasses}"` : ""}>\n`
    if (node.text && node.children.length === 0) {
      jsx += `${pad}  ${escapeJsxText(node.text)}\n`
    }
    for (const child of node.children) {
      jsx += renderJsx(child, styles, indent + 1, usedStyles, specsDir, svgContext)
    }
    jsx += `${pad}</a>\n`
    return jsx
  }

  // Spacer divs — self-closing
  if (node.className.includes("spacer") && node.children.length === 0) {
    return `${pad}<div${classes ? ` className="${classes}"` : ""} />\n`
  }

  const jsxTag = VALID_TAGS.has(tag) ? tag : "div"

  // Void element — must be self-closing in JSX.
  if (VOID_TAGS.has(jsxTag)) {
    const placeholder = node.text ? ` placeholder="${node.text.replace(/"/g, "&quot;")}"` : ""
    return `${pad}<${jsxTag}${classes ? ` className="${classes}"` : ""}${placeholder} />\n`
  }

  // Leaf element with text only
  if (node.children.length === 0 && node.text) {
    return `${pad}<${jsxTag}${classes ? ` className="${classes}"` : ""}>${escapeJsxText(node.text)}</${jsxTag}>\n`
  }

  // Container element. When the parent is a heading whose children are
  // Webflow's per-word/per-char animation wrappers, JSX sibling rendering
  // swallows the inter-element whitespace and produces "Yourfavoriteforms"
  // instead of "Your favorite forms". Detect that shape and inject a
  // whitespace text node between siblings. See docs/issues/005.
  let jsx = `${pad}<${jsxTag}${classes ? ` className="${classes}"` : ""}>\n`
  const separateWithWhitespace = isWordFragmentParent(jsxTag, node.children)
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]
    jsx += renderJsx(child, styles, indent + 1, usedStyles, specsDir, svgContext)
    if (separateWithWhitespace && i < node.children.length - 1) {
      jsx += `${"  ".repeat(indent + 1)}{" "}\n`
    }
  }
  jsx += `${pad}</${jsxTag}>\n`
  return jsx
}

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"])
const WORD_FRAGMENT_LEAF_TAGS = new Set(["div", "span"])

function isWordFragmentParent(parentTag: string, children: TreeNode[]): boolean {
  if (!HEADING_TAGS.has(parentTag)) return false
  if (children.length < 2) return false
  return children.every(child => {
    if (!WORD_FRAGMENT_LEAF_TAGS.has(child.tag)) return false
    if (child.children.length > 0) return false
    if (!child.text || child.text.length === 0) return false
    if (child.text.length > 60) return false
    return true
  })
}

export function mapToLocalImage(cdnUrl: string, alt: string, specsDir: string = SPECS_DIR): string {
  const manifestPath = existsSync(join(specsDir, "image-manifest.json"))
    ? join(specsDir, "image-manifest.json")
    : existsSync(join(specsDir, "images.json"))
      ? join(specsDir, "images.json")
      : null
  // Degrade gracefully when image extraction failed (e.g. extract-images
  // SIGKILL'd by the subprocess timeout — see docs/issues/002). Without
  // the manifest we can't map paths, but throwing here aborts the entire
  // page's JSX generation; instead, keep the original CDN URL so the page
  // still builds. Consumer can whitelist the CDN host in
  // `next.config.remotePatterns`.
  if (!manifestPath) {
    console.warn(`[generate-jsx] Missing image manifest in ${specsDir} — falling back to CDN URL for ${cdnUrl}`)
    return cdnUrl
  }

  let manifest: { sections?: Array<{ images?: Array<{ originalUrl?: string; alt?: string; localPath?: string }> }> }
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"))
  } catch (err) {
    console.warn(`[generate-jsx] Failed to parse ${manifestPath} (${(err as Error).message}) — falling back to CDN URL for ${cdnUrl}`)
    return cdnUrl
  }
  if (!Array.isArray(manifest.sections)) {
    console.warn(`[generate-jsx] Invalid image manifest in ${manifestPath} (expected sections[]) — falling back to CDN URL for ${cdnUrl}`)
    return cdnUrl
  }

  for (const section of manifest.sections) {
    for (const img of section.images ?? []) {
      if (img.originalUrl === cdnUrl || (alt && img.alt === alt)) {
        if (img.localPath) return "/" + img.localPath
      }
    }
  }

  // Fallback: image is referenced in structure but missing from manifest
  // (e.g. inactive Webflow tab content filtered out by visibility check during
  // image extraction). Return the original CDN URL so next/image can fetch it
  // remotely; consumer must whitelist the host in next.config remotePatterns.
  console.warn(`[generate-jsx] No local mapping for ${cdnUrl} — falling back to CDN URL`)
  return cdnUrl
}

function loadInlineSvgsByLabel(specsDir: string): Map<string, InlineSvgEntry[]> {
  const manifestPath = existsSync(join(specsDir, "image-manifest.json"))
    ? join(specsDir, "image-manifest.json")
    : null
  if (!manifestPath) return new Map()
  let manifest: { sections?: Array<{ label?: string; inlineSvgs?: InlineSvgEntry[] }> }
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"))
  } catch {
    return new Map()
  }
  const map = new Map<string, InlineSvgEntry[]>()
  for (const section of manifest.sections ?? []) {
    if (!section.label) continue
    if (!Array.isArray(section.inlineSvgs)) continue
    // Strip the leading `NN-` so the lookup matches `<label>` from
    // `<NN>-<label>.structure.md`.
    const normalizedLabel = section.label.replace(/^\d+-/, "")
    map.set(normalizedLabel, section.inlineSvgs)
    map.set(section.label, section.inlineSvgs)
  }
  return map
}

// --- Main ---

export function generateJsx(args: { specsDir?: string; outputDir?: string } = {}) {
  const specsDir = args.specsDir ?? SPECS_DIR
  const outputDir = args.outputDir ?? OUTPUT_DIR
  mkdirSync(outputDir, { recursive: true })

  const files = readdirSync(specsDir).filter(f => f.endsWith(".structure.md")).sort()
  console.log(`Generating JSX for ${files.length} sections from ${specsDir}\n`)

  const inlineSvgsByLabel = loadInlineSvgsByLabel(specsDir)

  for (const structureFile of files) {
    const label = structureFile.replace(".structure.md", "")
    const stylesFile = `${label}.styles.json`

    const structureMd = readFileSync(join(specsDir, structureFile), "utf-8")
    const tree = parseStructureTree(structureMd)
    if (!tree) {
      console.log(`  [${label}] SKIP — no tree parsed`)
      continue
    }

    let styles: StyleEntry[] = []
    try {
      styles = loadStyles(join(specsDir, stylesFile))
    } catch {
      console.log(`  [${label}] WARN — no styles file, generating structure only`)
    }

    const svgContext: SvgRenderContext = {
      entries: inlineSvgsByLabel.get(label) ?? [],
      cursor: { i: 0 },
    }
    const jsx = renderJsx(tree, styles, 0, new Set(), specsDir, svgContext)

    const outputFile = `${label}.generated.jsx`
    const output = `{/* Auto-generated from blazity.com — do not edit classes manually */}\n{/* Source: ${structureFile} + ${stylesFile} */}\n\n${jsx}`

    writeFileSync(join(outputDir, outputFile), output)
    console.log(`  [${label}] → ${outputFile}`)
  }

  console.log(`\nDone! Generated JSX in ${outputDir}/`)
}

function main() {
  generateJsx({ specsDir: SPECS_DIR, outputDir: OUTPUT_DIR })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
}
