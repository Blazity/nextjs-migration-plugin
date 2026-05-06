import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSite } from "./load-site.ts";
import { loadComponents } from "./load-components.ts";
import { loadRoutes } from "./load-routes.ts";
import { loadLayouts } from "./load-layouts.ts";
import { loadProbe } from "./load-probe.ts";
import { loadCrawl } from "./load-crawl.ts";
import { loadSections } from "./load-sections.ts";
import { writePlan, writeExecution, writeVerification } from "./phase-state.ts";
import { checkProjectScaffold } from "./project-scaffold.ts";
import { copyStagedAssets } from "./asset-copier.ts";
import { runJsxGeneration as defaultRunJsxGen } from "./jsx-generator-runner.ts";
import { runNextBuild as defaultRunNextBuild, type RunNextBuildResult } from "./next-build-runner.ts";
import { runVerifyBuildBaseline as defaultRunVerifyBaseline, type RunVerifyBuildBaselineResult } from "./verify-build-baseline-runner.ts";
import { sanitizeComponentName } from "./component-tsx-emitter.ts";
import { groupRoutesByNextRoute, assemblePageTsx } from "./page-assembler.ts";
import { assembleRootLayoutTsx } from "./layout-assembler.ts";
import { loadGlobalFoundation, renderGlobalCss } from "./global-styles.ts";
import { appendSessionLog } from "./session-log.ts";
import type { BuildManifest } from "../schemas/build-manifest.ts";

export interface RunBuildArgs {
  targetDir: string;
  runDir: string;
  pluginRoot?: string;
  runJsxGenerator?: (a: { specsDir: string; outputDir: string; pluginRoot: string }) => Promise<unknown>;
  runNextBuild?: (a: { targetDir: string }) => Promise<RunNextBuildResult>;
  runVerifyBuildBaseline?: (a: {
    referenceUrl: string; localUrl: string; specsDir: string; adapterPath: string; pluginRoot: string;
  }) => Promise<RunVerifyBuildBaselineResult>;
}

export async function runBuild(args: RunBuildArgs): Promise<void> {
  const pluginRoot = args.pluginRoot ?? defaultPluginRoot();
  const phaseDir = join(args.targetDir, ".migration/runs", args.runDir, "phase-5-build");
  const buildDir = join(phaseDir, "build");
  mkdirSync(buildDir, { recursive: true });

  await writePlan(phaseDir, "# Phase 5 — Build\n\nGenerate Next.js TSX, run `next build`, verify against the source homepage.\n");

  const fail = (criteria: { name: string; passed: boolean; detail?: string }[]) =>
    writeVerification(phaseDir, { phase: "phase-5-build", passed: false, checkedAt: new Date().toISOString(), criteria });

  const siteResult = loadSite(join(args.targetDir, ".migration/SITE.md"));
  if (!siteResult.valid) { await fail([{ name: "SITE.md valid", passed: false }]); return; }

  const scaffold = checkProjectScaffold(args.targetDir);
  if (!scaffold.ok) {
    await fail([{ name: "target scaffold present", passed: false, detail: `missing: ${scaffold.missing.join(", ")}` }]);
    return;
  }

  const libDir = join(args.targetDir, ".migration/library");
  const componentsResult = loadComponents(join(libDir, "components.json"));
  if (!componentsResult.valid) { await fail([{ name: "components.json valid", passed: false }]); return; }
  const layoutsResult = loadLayouts(join(libDir, "layouts.json"));
  if (!layoutsResult.valid) { await fail([{ name: "layouts.json valid", passed: false }]); return; }
  const routesResult = loadRoutes(join(libDir, "routes.json"));
  if (!routesResult.valid) { await fail([{ name: "routes.json valid", passed: false }]); return; }

  const crawlResult = loadCrawl(join(args.targetDir, ".migration/runs", args.runDir, "phase-1-discover/discovery/crawl.json"));
  if (!crawlResult.valid) { await fail([{ name: "crawl.json valid", passed: false }]); return; }
  const probeResult = loadProbe(join(args.targetDir, ".migration/runs", args.runDir, "phase-1-discover/discovery/probe.json"));
  if (!probeResult.valid) { await fail([{ name: "probe.json valid", passed: false }]); return; }

  // sections.json from Phase 2 carries `tagSkeleton` per (page, sectionIndex).
  // Layout-shell emission needs it to map a layout shell to a section index
  // in `appearsOn[0]`. See open-issues/010.
  const sectionsResult = loadSections(join(args.targetDir, ".migration/runs", args.runDir, "phase-2-analyze/analysis/sections.json"));
  if (!sectionsResult.valid) { await fail([{ name: "sections.json valid", passed: false }]); return; }

  const slugByUrl = new Map<string, string>();
  for (const p of crawlResult.data.pages) slugByUrl.set(p.url, p.slug);

  const adapterByUrl = new Map<string, string>();
  for (const p of probeResult.data.pages) {
    if (p.matchedAdapters[0]) adapterByUrl.set(p.url, p.matchedAdapters[0]);
  }

  const pagesDir = join(args.targetDir, ".migration/pages");
  const routes = routesResult.data.routes;
  const groups = groupRoutesByNextRoute(routes);
  const homepage = crawlResult.data.pages.find(p => p.depth === 0) ?? crawlResult.data.pages[0];
  const homeSlug = homepage.slug;
  const homepageAdapter = adapterByUrl.get(homepage.url) ?? "";

  const globalsResult = loadGlobalFoundation(join(pagesDir, homeSlug, "spec/00-globals.json"));
  const globalsCssApplied = globalsResult.valid;
  if (globalsCssApplied) {
    writeFileSync(join(args.targetDir, "src/app/globals.css"), renderGlobalCss(globalsResult.data));
  }

  // 1. Generate per-page section TSX via the vendored generator (deterministic).
  const runJsxGen = args.runJsxGenerator ?? defaultRunJsxGen;
  for (const route of routes) {
    const slug = slugByUrl.get(route.sourceUrl);
    if (!slug) continue;
    const specsDir = join(pagesDir, slug, "spec");
    const outputDir = join(pagesDir, slug, "generated");
    if (existsSync(specsDir)) {
      await runJsxGen({ specsDir, outputDir, pluginRoot });
    }
  }

  // 2. Emit layout-shell component files first (Header/Footer/Nav). Layout
  //    shells are excluded from components.json by lib/analyze.ts; the layout
  //    assembler imports them by literal name. Track the (url, sectionIdx)
  //    pairs so the body emission below skips them. See open-issues/010.
  const componentEntries: BuildManifest["components"] = [];
  mkdirSync(join(args.targetDir, "src/components"), { recursive: true });
  const SLOT_NAMES: Record<"header" | "footer" | "nav", string> = { header: "Header", footer: "Footer", nav: "Nav" };
  const layoutShellSectionKeys = new Set<string>();
  for (const slot of ["header", "footer", "nav"] as const) {
    const shell = layoutsResult.data[slot];
    if (!shell) continue;
    const lookupUrl = shell.appearsOn[0];
    const slug = slugByUrl.get(lookupUrl);
    if (!slug) continue;
    const pageSections = sectionsResult.data.pages.find(p => p.url === lookupUrl);
    if (!pageSections) continue;
    const sectionIdx = pageSections.sections.findIndex(s => s.tagSkeleton === shell.tagSkeleton);
    if (sectionIdx < 0) continue;
    // Mark THIS section, on every page where the shell appears, as already
    // emitted so the body loop does not duplicate it.
    for (const url of shell.appearsOn) {
      const sec = sectionsResult.data.pages.find(p => p.url === url)?.sections.findIndex(s => s.tagSkeleton === shell.tagSkeleton);
      if (sec !== undefined && sec >= 0) layoutShellSectionKeys.add(`${url}#${sec}`);
    }
    const generated = join(pagesDir, slug, "generated");
    const sectionTsx = pickSectionTsxForMember({ generatedDir: generated, sectionId: `pX-s${sectionIdx}` });
    if (!sectionTsx) continue;
    const name = SLOT_NAMES[slot];
    const filePath = `src/components/${name}.tsx`;
    writeFileSync(join(args.targetDir, filePath), transformOrWrap(sectionTsx, name));
    componentEntries.push({ id: shell.id, name, filePath, memberCount: shell.appearsOn.length });
  }

  // 3. Per-page body section emission. Each (page, section) gets its own TSX
  //    file under src/components/<Slug><Idx>-<Label>.tsx. No cluster-level
  //    dedup at codegen — different pages render different content even when
  //    Phase 2 clustered them together. Filters non-visual tag skeletons so
  //    <script>/<noscript> sections never become components. See open-issues/012.
  const NON_VISUAL_TAG = /^(script|noscript|style|link|meta)\b/i;
  const sectionRefsBySlug = new Map<string, { componentName: string }[]>();
  for (const route of routes) {
    const slug = slugByUrl.get(route.sourceUrl);
    if (!slug) continue;
    const generatedDir = join(pagesDir, slug, "generated");
    if (!existsSync(generatedDir)) {
      sectionRefsBySlug.set(slug, []);
      continue;
    }
    const pageSections = sectionsResult.data.pages.find(p => p.url === route.sourceUrl)?.sections ?? [];
    const slugPascal = sanitizeComponentName(slug);
    const refs: { componentName: string }[] = [];
    const tsxFiles = readdirSync(generatedDir)
      .filter(f => f.endsWith(".generated.jsx") || f.endsWith(".tsx"))
      .sort();
    for (const f of tsxFiles) {
      const m = f.match(/^(\d+)-(.+?)\.(generated\.jsx|tsx)$/);
      if (!m) continue;
      const idx = parseInt(m[1], 10) - 1;
      const label = m[2];
      const sec = pageSections[idx];
      if (sec && NON_VISUAL_TAG.test(sec.tagSkeleton)) continue;
      if (layoutShellSectionKeys.has(`${route.sourceUrl}#${idx}`)) continue;
      const compName = `${slugPascal}${sanitizeComponentName(`${m[1]}-${label}`)}`;
      const tsx = readFileSync(join(generatedDir, f), "utf8");
      const filePath = `src/components/${compName}.tsx`;
      writeFileSync(join(args.targetDir, filePath), transformOrWrap(tsx, compName));
      componentEntries.push({ id: `${slug}-s${idx}`, name: compName, filePath, memberCount: 1 });
      refs.push({ componentName: compName });
    }
    sectionRefsBySlug.set(slug, refs);
  }

  // 4. Emit page files (one per route group).
  const pageEntries: BuildManifest["pages"] = [];
  for (const group of groups) {
    const sourceUrl = group.entries[0].sourceUrl;
    const slug = slugByUrl.get(sourceUrl);
    if (!slug) continue;
    const sectionRefs = sectionRefsBySlug.get(slug) ?? [];
    const tsx = assemblePageTsx({ group, sectionRefs });
    const routeDir = join(args.targetDir, "src/app", group.nextRoute === "/" ? "" : group.nextRoute);
    mkdirSync(routeDir, { recursive: true });
    const filePath = join(routeDir, "page.tsx");
    writeFileSync(filePath, tsx);
    for (const e of group.entries) {
      pageEntries.push({ sourceUrl: e.sourceUrl, nextRoute: group.nextRoute, filePath: filePath.replace(args.targetDir + "/", "") });
    }
  }

  // 5. Optional root layout. Slot names match the SLOT_NAMES used above.
  const layoutTsx = assembleRootLayoutTsx({
    header: layoutsResult.data.header ? { componentName: SLOT_NAMES.header } : null,
    footer: layoutsResult.data.footer ? { componentName: SLOT_NAMES.footer } : null,
    nav: layoutsResult.data.nav ? { componentName: SLOT_NAMES.nav } : null,
  });
  if (layoutTsx) writeFileSync(join(args.targetDir, "src/app/layout.tsx"), layoutTsx);

  // 5. Copy staged assets.
  const slugs = Array.from(new Set(routes.map(r => slugByUrl.get(r.sourceUrl)).filter((s): s is string => Boolean(s))));
  const copy = copyStagedAssets({ pagesDir, slugs, targetDir: args.targetDir });
  const assetEntries: BuildManifest["assets"] = copy.copied.map(c => ({ from: c.from, to: c.to }));

  const componentStrategy =
    "Per-page section components: v1 emits one TSX file per page section for visual stability; prop-based reusable component consolidation is deferred to a later polish/refactor pass.";
  const globalsSummary = globalsCssApplied
    ? "Global styles: applied extracted homepage body background, foreground, and font foundation from 00-globals.json."
    : `Global styles: skipped because homepage 00-globals.json was unavailable or invalid (${globalsResult.issues[0]?.message ?? "unknown error"}).`;
  const executionSummary = `Generated ${componentEntries.length} components, ${pageEntries.length} page entries, copied ${assetEntries.length} assets.\n\n${componentStrategy}\n\n${globalsSummary}`;
  await writeExecution(phaseDir, executionSummary);
  appendSessionLog({ targetDir: args.targetDir, title: "Phase 5 build", body: executionSummary });

  // 6. Run next build.
  const buildImpl = args.runNextBuild ?? ((a: { targetDir: string }) => defaultRunNextBuild(a));
  const buildResult = await buildImpl({ targetDir: args.targetDir });

  // 7. Verify-build-baseline against the homepage.
  let baselineResult: RunVerifyBuildBaselineResult = { passed: false, detail: "skipped (build failed)" };
  if (buildResult.exitCode === 0) {
    const verifyImpl = args.runVerifyBuildBaseline ?? ((a) => defaultRunVerifyBaseline(a));
    baselineResult = await verifyImpl({
      referenceUrl: homepage.url,
      localUrl: "http://localhost:3000/",
      specsDir: join(pagesDir, homeSlug, "spec"),
      adapterPath: homepageAdapter,
      pluginRoot,
    });
  }

  const manifest: BuildManifest = {
    generatedAt: new Date().toISOString(),
    components: componentEntries,
    pages: pageEntries,
    assets: assetEntries,
  };
  writeFileSync(join(buildDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  // With per-page section emission the gate counts ROUTES emitted, not
  // clusters. Each route has its own component files under src/components/
  // referenced from app/<route>/page.tsx. Layout shells (Header/Footer/Nav)
  // are tracked separately so empty layouts.json still passes.
  const everyRouteEmitted = groups.every(g => existsSync(join(args.targetDir, "src/app", g.nextRoute === "/" ? "" : g.nextRoute, "page.tsx")));
  const everyRouteHasSections = routes.every(r => {
    const slug = slugByUrl.get(r.sourceUrl);
    return slug ? (sectionRefsBySlug.get(slug)?.length ?? 0) > 0 : false;
  });
  const populatedSlots = (["header", "footer", "nav"] as const).filter(s => layoutsResult.data[s] !== null);
  const emittedShellNames = new Set(componentEntries.filter(e => Object.values(SLOT_NAMES).includes(e.name)).map(e => e.name));
  const everyShellEmitted = populatedSlots.every(s => emittedShellNames.has(SLOT_NAMES[s]));

  await writeVerification(phaseDir, {
    phase: "phase-5-build",
    passed: scaffold.ok && everyRouteEmitted && everyRouteHasSections && everyShellEmitted && buildResult.exitCode === 0 && baselineResult.passed,
    checkedAt: new Date().toISOString(),
    criteria: [
      { name: "target scaffold present", passed: scaffold.ok },
      { name: "every route in routes.json was emitted", passed: everyRouteEmitted },
      { name: "every route has at least one body section emitted", passed: everyRouteHasSections },
      { name: "every populated layout slot has a shell component emitted", passed: everyShellEmitted },
      { name: "next build exit 0", passed: buildResult.exitCode === 0, detail: buildResult.exitCode === 0 ? undefined : buildResult.stderr.slice(0, 400) },
      { name: "verify-build-baseline passed at 1440px against homepage", passed: baselineResult.passed, detail: baselineResult.detail },
    ],
  });
}

function pickSectionTsxForMember(args: { generatedDir: string; sectionId: string }): string | null {
  if (!existsSync(args.generatedDir)) return null;
  // Vendored generate-jsx.ts emits `<label>.generated.jsx`. Test stubs may
  // emit `.tsx` directly with a pre-formed export. Accept both — the wrap
  // step downstream detects pre-wrapped vs raw input. See open-issues/007.
  const tsxFiles = readdirSync(args.generatedDir)
    .filter(f => f.endsWith(".tsx") || f.endsWith(".generated.jsx"))
    .sort();
  const matchIndex = Number(args.sectionId.split("-s")[1] ?? "0");
  const file = tsxFiles[matchIndex] ?? tsxFiles[0];
  if (!file) return null;
  return readFileSync(join(args.generatedDir, file), "utf8");
}

// Next.js components referenced by the vendored codegen. Each tag triggers
// the matching `import` line when detected in the JSX body.
const NEXT_IMPORTS: Record<string, string> = {
  Image: 'import Image from "next/image";',
  Link: 'import Link from "next/link";',
  Script: 'import Script from "next/script";',
};

export function detectNextImports(body: string): string {
  const lines = Object.entries(NEXT_IMPORTS)
    .filter(([tag]) => new RegExp(`<${tag}\\b`).test(body))
    .map(([, line]) => line);
  return lines.length > 0 ? lines.join("\n") + "\n\n" : "";
}

// Vendored generate-jsx.ts embeds DOM textContent verbatim into JSX. Source
// pages with copy like "Lightweight Client SDK (<5kB gzipped)" hit the JSX
// parser as `<5` — a tag-name start that fails because `5` is not a valid
// tag-name character. Escape every `<` not followed by a tag-name-start
// character to `&lt;`. JSX tag names start with [a-zA-Z], `/`, `!`, or `?`.
// See knowledge/open-issues/009.
export function escapeUnsafeLessThan(jsx: string): string {
  return jsx.replace(/<(?![a-zA-Z/!?])/g, "&lt;");
}

function indentLines(s: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return s.split("\n").map(line => (line.length > 0 ? pad + line : line)).join("\n");
}

// Transform a section's emitted source into a valid React module. If the
// input already contains `export default function ...`, treat it as a
// pre-wrapped component and just rename. Otherwise strip leading JSX
// expression-comments (which are invalid at module top), inject Next.js
// imports for any referenced components, and wrap the JSX body in a
// fragment-returning default-export function. See open-issues/008.
export function transformOrWrap(raw: string, name: string): string {
  if (/export\s+default\s+function\s+\w+/.test(raw)) {
    return raw.replace(/export\s+default\s+function\s+\w+/, `export default function ${name}`);
  }
  const stripped = raw.replace(/^\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)+/g, "").trim();
  const escaped = escapeUnsafeLessThan(stripped);
  const imports = detectNextImports(escaped);
  return `${imports}export default function ${name}() {
  return (
    <>
${indentLines(escaped, 6)}
    </>
  );
}
`;
}

function defaultPluginRoot(): string {
  return resolve(fileURLToPath(new URL("..", import.meta.url)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const get = (flag: string) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const targetDir = get("--target") ?? process.cwd();
  const runDir = get("--run") ?? "001-initial";
  runBuild({ targetDir, runDir })
    .then(() => console.log(`Build phase complete for run ${runDir}.`))
    .catch(err => { console.error(err.message); process.exit(1); });
}
