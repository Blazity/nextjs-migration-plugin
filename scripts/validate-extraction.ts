import { readFileSync, readdirSync, existsSync } from "fs"
import { join, basename } from "path"
import { createHash } from "crypto"

const specDirs = process.argv.slice(2).filter(a => !a.startsWith("--"))

if (specDirs.length === 0) {
  console.error("Usage: pnpm ts scripts/validate-extraction.ts <spec-dir-1> [spec-dir-2] [...]")
  console.error("  Validates that extracted specs are unique across pages (catches SPA fallback content).")
  process.exit(1)
}

if (specDirs.length === 1) {
  const dir = specDirs[0]
  if (!existsSync(dir)) {
    console.error(`FAIL: spec directory does not exist: ${dir}`)
    process.exit(1)
  }
  const structureFiles = readdirSync(dir).filter(f => f.endsWith(".structure.md"))
  if (structureFiles.length === 0) {
    console.error(`FAIL: no .structure.md files found in ${dir}`)
    process.exit(1)
  }
  console.log(`PASS: single-page migration (${structureFiles.length} sections in ${basename(dir)}), no cross-page validation needed.`)
  process.exit(0)
}

interface PageDigest {
  dir: string
  name: string
  hash: string
  h1Text: string
  elementCount: number
  sectionCount: number
}

function findContentFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const files = readdirSync(dir)
  const structureFiles = files.filter(f => f.endsWith(".structure.md")).sort()
  if (structureFiles.length < 3) return structureFiles.map(f => join(dir, f))
  return structureFiles.slice(1, -1).map(f => join(dir, f))
}

function extractH1(content: string): string {
  const match = content.match(/"([^"]+)"/)
  if (match) return match[1].slice(0, 60)
  const headingMatch = content.match(/h1[^\n]*"([^"]+)"/)
  if (headingMatch) return headingMatch[1].slice(0, 60)
  return "(no h1 found)"
}

function countElements(content: string): number {
  return content.split("\n").filter(line => line.trim().startsWith("- ")).length
}

const digests: PageDigest[] = []

for (const dir of specDirs) {
  const contentFiles = findContentFiles(dir)
  if (contentFiles.length === 0) {
    console.warn(`  WARN: No structure.md found in ${dir}`)
    continue
  }

  const combinedContent = contentFiles.map(f => readFileSync(f, "utf-8")).join("\n---\n")
  const hash = createHash("md5").update(combinedContent).digest("hex").slice(0, 12)

  digests.push({
    dir,
    name: basename(dir),
    hash,
    h1Text: extractH1(combinedContent),
    elementCount: countElements(combinedContent),
    sectionCount: contentFiles.length,
  })
}

// Check for duplicates
const hashGroups = new Map<string, PageDigest[]>()
for (const d of digests) {
  const group = hashGroups.get(d.hash) || []
  group.push(d)
  hashGroups.set(d.hash, group)
}

const duplicateGroups = Array.from(hashGroups.values()).filter(g => g.length > 1)


console.log("Extraction Validation Results:\n")

for (const d of digests) {
  const isDuplicate = duplicateGroups.some(g => g.some(p => p.dir === d.dir))
  const status = isDuplicate ? "DUPLICATE" : "UNIQUE"
  const dupOf = isDuplicate
    ? duplicateGroups.find(g => g.some(p => p.dir === d.dir))![0].name
    : ""
  const dupLabel = isDuplicate && d.name !== dupOf ? ` (same as ${dupOf})` : ""
  console.log(`  ${d.name.padEnd(30)} hash=${d.hash}  h1="${d.h1Text}"  elements=${d.elementCount}  ${status}${dupLabel}`)
}

// Check for identical h1 across all pages
const h1Set = new Set(digests.map(d => d.h1Text))
if (h1Set.size === 1 && digests.length > 1) {
  console.log(`\n  WARNING: All ${digests.length} pages have identical h1 text: "${digests[0].h1Text}"`)
}

if (duplicateGroups.length === 0 && digests.length >= 2) {
  for (let i = 0; i < digests.length; i++) {
    for (let j = i + 1; j < digests.length; j++) {
      const filesA = findContentFiles(digests[i].dir)
      const filesB = findContentFiles(digests[j].dir)
      const hashesA = filesA.map(f => createHash("md5").update(readFileSync(f, "utf-8")).digest("hex").slice(0, 12))
      const hashesB = filesB.map(f => createHash("md5").update(readFileSync(f, "utf-8")).digest("hex").slice(0, 12))
      const matching = hashesA.filter(h => hashesB.includes(h)).length
      const total = Math.max(hashesA.length, hashesB.length)
      if (total > 0 && matching / total > 0.5) {
        console.log(`  WARN: ${digests[i].name} and ${digests[j].name} share ${matching}/${total} identical sections (${Math.round(matching/total*100)}%)`)
      }
    }
  }
}

console.log("")

if (duplicateGroups.length > 0) {
  const totalDupes = duplicateGroups.reduce((sum, g) => sum + g.length, 0)
  console.log(`FAIL: ${totalDupes}/${digests.length} content sections are duplicates.`)
  console.log("Likely cause: SPA pages rendered fallback content instead of page-specific content.")
  console.log("Recommendation: Use scripts/extract-spa-flow.ts with a flow definition.\n")
  process.exit(1)
} else {
  console.log(`PASS: All ${digests.length} pages have unique content sections.`)
  process.exit(0)
}
