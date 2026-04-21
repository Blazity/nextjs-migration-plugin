import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs"
import { join } from "path"

const SPECS_DIR = process.argv[2] || "docs/specs/homepage"
const PATCHES_DIR = process.argv[3] || "docs/patches/homepage"

// Map section spec files to component source files
const SECTION_TO_FILE: Record<string, string> = {
  "01-navbar-component": "src/components/layout/navbar.tsx",
  "02-banner-vercel": "src/app/page.tsx",
  "03-ai-native-next-js-architects": "src/components/sections/hero-section.tsx",
  "04-stats-home": "src/components/sections/stats-block.tsx",
  "05-our-offer": "src/components/sections/services-tabs.tsx",
  "06-blazity-s-work-has-increased-t": "src/components/sections/testimonial-carousel.tsx",
  "07-every-second-your-frontend-los": "src/app/page.tsx",
  "08-proof-before-commitment": "src/app/page.tsx",
  "09-results-not-promises": "src/app/page.tsx",
  "10-from-our-engineers": "src/app/page.tsx",
  "11-no-pitch-deck-just-a-technical": "src/components/sections/contact-form.tsx",
  "12-section-footer": "src/components/layout/footer.tsx",
}

interface StyleEntry {
  selector: string
  text: string
  classes: string
  rawStyles?: Record<string, string>
  hoverClasses?: string
}

interface PatchInstruction {
  file: string
  section: string
  find: string
  replace: string
  context: string
  line?: number
}

function normalizeClasses(classes: string): string {
  return classes.split(/\s+/).filter(Boolean).sort().join(" ")
}

function findClassNameInSource(
  source: string,
  text: string,
  _tag?: string
): { className: string; line: number } | null {
  const lines = source.split("\n")

  // Strategy 1: Find line containing the text content, then find nearest className
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (text && line.includes(text.replace(/"/g, "&quot;").slice(0, 25))) {
      // Search backwards for className on this element
      for (let j = i; j >= Math.max(0, i - 5); j--) {
        const classMatch = lines[j].match(/className="([^"]+)"/)
        if (classMatch) {
          return { className: classMatch[1], line: j + 1 }
        }
      }
      // Search forwards too (className might be after text in JSX)
      for (let j = i; j <= Math.min(lines.length - 1, i + 3); j++) {
        const classMatch = lines[j].match(/className="([^"]+)"/)
        if (classMatch) {
          return { className: classMatch[1], line: j + 1 }
        }
      }
    }
  }

  // Strategy 2: Also try escaped quotes and entity versions
  const escapedText = text.replace(/'/g, "&apos;").replace(/"/g, "&quot;")
  if (escapedText !== text) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(escapedText.slice(0, 25))) {
        for (let j = i; j >= Math.max(0, i - 5); j--) {
          const classMatch = lines[j].match(/className="([^"]+)"/)
          if (classMatch) return { className: classMatch[1], line: j + 1 }
        }
      }
    }
  }

  return null
}

// Rank selectors: specific elements first, generic containers last
const SELECTOR_PRIORITY: Record<string, number> = {
  h1: 0, h2: 0, h3: 0, h4: 0, p: 1, a: 1, button: 1, span: 2,
  input: 2, textarea: 2, select: 2, label: 2, nav: 3, form: 3,
  div: 4, section: 5, header: 5, footer: 5,
}

function selectorPriority(selector: string): number {
  const tag = selector.split(".")[0]
  return SELECTOR_PRIORITY[tag] ?? 4
}

function generatePatches(sectionLabel: string, specFile: string, sourceFile: string): PatchInstruction[] {
  const specs: StyleEntry[] = JSON.parse(readFileSync(specFile, "utf-8"))
  // Sort: specific elements first so they claim their source lines before parents do
  specs.sort((a, b) => selectorPriority(a.selector) - selectorPriority(b.selector))
  const source = readFileSync(sourceFile, "utf-8")
  const patches: PatchInstruction[] = []

  // Track which source lines we've already patched to avoid duplicates
  const patchedLines = new Set<number>()

  for (const entry of specs) {
    if (!entry.text?.trim()) continue
    if (!entry.classes?.trim()) continue

    const found = findClassNameInSource(source, entry.text)
    if (!found) continue
    if (patchedLines.has(found.line)) continue

    const specNormalized = normalizeClasses(entry.classes)
    const sourceNormalized = normalizeClasses(found.className)

    if (specNormalized === sourceNormalized) continue

    patchedLines.add(found.line)

    // If hover classes present, emit a single combined patch
    if (entry.hoverClasses && !found.className.includes("hover:")) {
      const hoverTw = entry.hoverClasses.split(" ").map(c => `hover:${c}`).join(" ")
      patches.push({
        file: sourceFile,
        section: sectionLabel,
        find: `className="${found.className}"`,
        replace: `className="${entry.classes} ${hoverTw} transition-all duration-[275ms]"`,
        context: `element containing "${entry.text.slice(0, 40)}" (with hover)`,
        line: found.line,
      })
    } else {
      patches.push({
        file: sourceFile,
        section: sectionLabel,
        find: `className="${found.className}"`,
        replace: `className="${entry.classes}"`,
        context: `element containing "${entry.text.slice(0, 40)}"`,
        line: found.line,
      })
    }
  }

  return patches
}

function main() {
  mkdirSync(PATCHES_DIR, { recursive: true })
  const specFiles = readdirSync(SPECS_DIR).filter(f => f.endsWith(".styles.json")).sort()

  console.log(`Generating class patches from ${SPECS_DIR}\n`)

  let totalPatches = 0
  let totalMatched = 0
  let totalUnmatched = 0

  for (const specFile of specFiles) {
    const label = specFile.replace(".styles.json", "")
    const sourceFile = SECTION_TO_FILE[label]
    if (!sourceFile) {
      console.log(`  [${label}] SKIP — no source file mapping`)
      continue
    }

    const patches = generatePatches(label, join(SPECS_DIR, specFile), sourceFile)

    const specs: StyleEntry[] = JSON.parse(readFileSync(join(SPECS_DIR, specFile), "utf-8"))
    const textEntries = specs.filter(e => e.text?.trim() && e.classes?.trim())
    const unmatchedCount = textEntries.length - patches.length

    if (patches.length > 0) {
      let md = `# Patches for ${label}\n\n`
      md += `**File:** \`${sourceFile}\`\n`
      md += `**Patches:** ${patches.length} className replacements\n\n`

      for (const patch of patches) {
        md += `---\n\n`
        md += `**Context:** ${patch.context}\n`
        if (patch.line) md += `**Line:** ~${patch.line}\n`
        md += `\n`
        md += `FIND:\n\`\`\`\n${patch.find}\n\`\`\`\n\n`
        md += `REPLACE:\n\`\`\`\n${patch.replace}\n\`\`\`\n\n`
      }

      writeFileSync(join(PATCHES_DIR, `${label}.patch.md`), md)
    }

    totalPatches += patches.length
    totalMatched += patches.length
    totalUnmatched += unmatchedCount

    console.log(`  [${label}] ${patches.length} patches (${textEntries.length} text elements, ${unmatchedCount} unmatched)`)
  }

  console.log(`\nTotal: ${totalPatches} patches across ${specFiles.length} sections`)
  console.log(`Matched: ${totalMatched}, Unmatched: ${totalUnmatched}`)
  console.log(`Patches written to ${PATCHES_DIR}/`)
}

main()
