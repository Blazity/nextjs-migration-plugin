import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "fs"
import { join } from "path"

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

    const textMatch = content.match(/"([^"]+)"/)
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

function renderJsx(node: TreeNode, styles: StyleEntry[], indent: number = 0, usedStyles: Set<number> = new Set()): string {
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
    const localSrc = mapToLocalImage(src, alt)
    return `${pad}<Image src="${localSrc}" alt="${alt}" width={${width}} height={${height}}${classes ? ` className="${classes}"` : ""} />\n`
  }

  // Handle links
  if (tag === "a") {
    const href = node.attrs.href || "#"
    const hoverClasses = styleEntry?.hoverClasses
      ? " " + styleEntry.hoverClasses.split(" ").map(c => `hover:${c}`).join(" ") + " transition-all duration-[275ms]"
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
      jsx += renderJsx(child, styles, indent + 1, usedStyles)
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

  // Container element
  let jsx = `${pad}<${jsxTag}${classes ? ` className="${classes}"` : ""}>\n`
  for (const child of node.children) {
    jsx += renderJsx(child, styles, indent + 1, usedStyles)
  }
  jsx += `${pad}</${jsxTag}>\n`
  return jsx
}

function mapToLocalImage(cdnUrl: string, alt: string): string {
  const manifestPath = join(SPECS_DIR, "image-manifest.json")
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"))
    for (const section of manifest.sections) {
      for (const img of section.images) {
        if (img.originalUrl === cdnUrl || img.alt === alt) {
          return "/" + img.localPath
        }
      }
    }
  } catch {}
  const filename = cdnUrl.split("/").pop()?.split("?")[0] || "unknown.png"
  return `/images/homepage/${filename}`
}

// --- Main ---

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true })

  const files = readdirSync(SPECS_DIR).filter(f => f.endsWith(".structure.md")).sort()
  console.log(`Generating JSX for ${files.length} sections from ${SPECS_DIR}\n`)

  for (const structureFile of files) {
    const label = structureFile.replace(".structure.md", "")
    const stylesFile = `${label}.styles.json`

    const structureMd = readFileSync(join(SPECS_DIR, structureFile), "utf-8")
    const tree = parseStructureTree(structureMd)
    if (!tree) {
      console.log(`  [${label}] SKIP — no tree parsed`)
      continue
    }

    let styles: StyleEntry[] = []
    try {
      styles = loadStyles(join(SPECS_DIR, stylesFile))
    } catch {
      console.log(`  [${label}] WARN — no styles file, generating structure only`)
    }

    const jsx = renderJsx(tree, styles)

    const outputFile = `${label}.generated.jsx`
    const output = `{/* Auto-generated from blazity.com — do not edit classes manually */}\n{/* Source: ${structureFile} + ${stylesFile} */}\n\n${jsx}`

    writeFileSync(join(OUTPUT_DIR, outputFile), output)
    console.log(`  [${label}] → ${outputFile}`)
  }

  console.log(`\nDone! Generated JSX in ${OUTPUT_DIR}/`)
}

main()
