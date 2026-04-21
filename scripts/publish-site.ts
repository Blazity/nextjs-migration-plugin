import { execFileSync } from "child_process"
import { existsSync } from "fs"
import { join } from "path"

const siteName = process.argv[2]
const isDryRun = process.argv.includes("--dry-run")
const org = process.argv.find(a => a.startsWith("--org="))?.split("=")[1] || "blazity"

if (!siteName) {
  console.error("Usage: pnpm ts scripts/publish-site.ts <site-name> [--dry-run] [--org=<github-org>]")
  process.exit(1)
}

const SAFE_NAME = /^[a-zA-Z0-9._-]+$/
if (!SAFE_NAME.test(siteName) || !SAFE_NAME.test(org)) {
  console.error("Error: site name and org must match /^[a-zA-Z0-9._-]+$/")
  process.exit(1)
}

const siteDir = join("migrated-sites", siteName)
const packageJson = join(siteDir, "package.json")

if (!existsSync(siteDir)) {
  console.error(`Error: ${siteDir}/ does not exist`)
  process.exit(1)
}

if (!existsSync(packageJson)) {
  console.error(`Error: ${packageJson} not found — is this a valid project?`)
  process.exit(1)
}

const repoName = `demo-${siteName}`
const repoFull = `${org}/${repoName}`

console.log(`Publishing ${siteName} to GitHub...`)
console.log(`  Site directory: ${siteDir}/`)
console.log(`  GitHub repo: ${repoFull}`)
console.log(`  Dry run: ${isDryRun}`)
console.log()

if (isDryRun) {
  console.log("[DRY RUN] Would execute:")
  console.log(`  1. gh repo create ${repoFull} --public --confirm`)
  console.log(`  2. cd ${siteDir} && git init && git add -A && git commit -m "Initial commit"`)
  console.log(`  3. git remote add origin git@github.com:${repoFull}.git`)
  console.log(`  4. git push -u origin main`)
  console.log()
  console.log("After publishing:")
  console.log(`  1. Go to https://vercel.com/new`)
  console.log(`  2. Import ${repoFull}`)
  console.log(`  3. Framework: Next.js, Root: ./`)
  console.log(`  4. Deploy`)
  process.exit(0)
}

try {
  console.log("Step 1: Creating GitHub repository...")
  execFileSync("gh", ["repo", "create", repoFull, "--public", "--confirm"], { stdio: "inherit" })
} catch {
  console.log("  Repository may already exist, continuing...")
}

console.log("Step 2: Initializing git in site directory...")
const gitDir = join(siteDir, ".git")
if (!existsSync(gitDir)) {
  execFileSync("git", ["init"], { cwd: siteDir, stdio: "inherit" })
}

console.log("Step 3: Committing all files...")
execFileSync("git", ["add", "-A"], { cwd: siteDir, stdio: "inherit" })
try {
  execFileSync("git", ["commit", "-m", "Initial commit — migrated from reference site"], { cwd: siteDir, stdio: "inherit" })
} catch {
  console.log("  Nothing to commit, continuing...")
}

console.log("Step 4: Setting remote and pushing...")
try {
  execFileSync("git", ["remote", "add", "origin", `git@github.com:${repoFull}.git`], { cwd: siteDir, stdio: "inherit" })
} catch {
  execFileSync("git", ["remote", "set-url", "origin", `git@github.com:${repoFull}.git`], { cwd: siteDir, stdio: "inherit" })
}
execFileSync("git", ["push", "-u", "origin", "main"], { cwd: siteDir, stdio: "inherit" })

console.log()
console.log("Done!")
console.log(`  Repository: https://github.com/${repoFull}`)
console.log()
console.log("Next steps:")
console.log("  1. Go to https://vercel.com/new")
console.log(`  2. Import ${repoFull}`)
console.log("  3. Framework: Next.js, Root: ./")
console.log("  4. Deploy")
