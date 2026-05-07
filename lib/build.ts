import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
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
import { runWithNextStartServer, type RunWithNextServerArgs } from "./next-start-runner.ts";
import { sanitizeComponentName, transformOrWrap } from "./component-tsx-emitter.ts";
import { groupRoutesByNextRoute, assemblePageTsx } from "./page-assembler.ts";
import { assembleRootLayoutTsx } from "./layout-assembler.ts";
import { loadGlobalFoundation, renderGlobalCss } from "./global-styles.ts";
import { appendSessionLog } from "./session-log.ts";
import { pickSectionTsxForMember } from "./section-tsx-source.ts";
import type { BuildManifest } from "../schemas/build-manifest.ts";

export {
  detectNextImports,
  escapeUnsafeLessThan,
  transformOrWrap,
} from "./component-tsx-emitter.ts";

export interface RunBuildArgs {
  targetDir: string;
  runDir: string;
  pluginRoot?: string;
  runJsxGenerator?: (a: { specsDir: string; outputDir: string; pluginRoot: string }) => Promise<unknown>;
  runNextBuild?: (a: { targetDir: string }) => Promise<RunNextBuildResult>;
  runVerifyBuildBaseline?: (a: {
    referenceUrl: string; localUrl: string; specsDir: string; adapterPath: string; pluginRoot: string;
  }) => Promise<RunVerifyBuildBaselineResult>;
  runWithNextServer?: (a: RunWithNextServerArgs) => Promise<RunVerifyBuildBaselineResult>;
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
    const chosen = pickLayoutShellSection({
      shell,
      pagesDir,
      slugByUrl,
      sections: sectionsResult.data.pages,
    });
    if (!chosen) continue;
    for (const key of chosen.sectionKeys) layoutShellSectionKeys.add(key);
    const name = SLOT_NAMES[slot];
    const filePath = `src/components/${name}.tsx`;
    writeFileSync(join(args.targetDir, filePath), transformOrWrap(chosen.sectionTsx, name));
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
  const assetReferenceCheck = checkAssetReferences(args.targetDir);

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
    const verify = (localUrl: string) => verifyImpl({
      referenceUrl: homepage.url,
      localUrl,
      specsDir: join(pagesDir, homeSlug, "spec"),
      adapterPath: homepageAdapter,
      pluginRoot,
    });
    try {
      if (args.runWithNextServer) {
        baselineResult = await args.runWithNextServer({ targetDir: args.targetDir, verify });
      } else if (args.runVerifyBuildBaseline) {
        baselineResult = await verify("http://localhost:3000/");
      } else {
        baselineResult = await runWithNextStartServer({ targetDir: args.targetDir, verify });
      }
    } catch (err) {
      baselineResult = { passed: false, detail: (err as Error).message };
    }
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
    passed: scaffold.ok && everyRouteEmitted && everyRouteHasSections && everyShellEmitted && assetReferenceCheck.passed && buildResult.exitCode === 0 && baselineResult.passed,
    checkedAt: new Date().toISOString(),
    criteria: [
      { name: "target scaffold present", passed: scaffold.ok },
      { name: "every route in routes.json was emitted", passed: everyRouteEmitted },
      { name: "every route has at least one body section emitted", passed: everyRouteHasSections },
      { name: "every populated layout slot has a shell component emitted", passed: everyShellEmitted },
      { name: "every emitted asset reference resolves to a file in public/", passed: assetReferenceCheck.passed, detail: assetReferenceCheck.detail },
      { name: "next build exit 0", passed: buildResult.exitCode === 0, detail: buildResult.exitCode === 0 ? undefined : buildResult.stderr.slice(0, 400) },
      { name: "verify-build-baseline passed at 1440px against homepage", passed: baselineResult.passed, detail: baselineResult.detail },
    ],
  });
}

function pickLayoutShellSection(args: {
  shell: { appearsOn: string[]; memberIds?: string[]; tagSkeleton: string };
  pagesDir: string;
  slugByUrl: Map<string, string>;
  sections: { url: string; sections: { id: string; tagSkeleton: string }[] }[];
}): { sectionTsx: string; sectionKeys: string[] } | null {
  for (const memberId of args.shell.memberIds ?? []) {
    const parsed = parseSectionMemberId(memberId);
    if (!parsed) continue;
    const candidate = findSectionCandidate({
      url: parsed.url,
      sectionId: parsed.sectionId,
      pagesDir: args.pagesDir,
      slugByUrl: args.slugByUrl,
      sections: args.sections,
    });
    if (!candidate) continue;
    return {
      sectionTsx: candidate.sectionTsx,
      sectionKeys: sectionKeysFromMemberIds(args.shell.memberIds ?? [], args.sections),
    };
  }

  const sectionKeys: string[] = [];
  let chosen: { sectionTsx: string } | null = null;
  for (const candidateUrl of args.shell.appearsOn) {
    const candidateSlug = args.slugByUrl.get(candidateUrl);
    if (!candidateSlug) continue;
    const candidateSections = args.sections.find(p => p.url === candidateUrl);
    if (!candidateSections) continue;
    const candidateIdx = candidateSections.sections.findIndex(s => s.tagSkeleton === args.shell.tagSkeleton);
    if (candidateIdx < 0) continue;
    const candidateTsx = pickSectionTsxForMember({
      generatedDir: join(args.pagesDir, candidateSlug, "generated"),
      sectionId: `pX-s${candidateIdx}`,
    })?.tsx;
    if (!candidateTsx) continue;
    chosen = { sectionTsx: candidateTsx };
    break;
  }
  if (!chosen) return null;

  for (const url of args.shell.appearsOn) {
    const sec = args.sections.find(p => p.url === url)?.sections.findIndex(s => s.tagSkeleton === args.shell.tagSkeleton);
    if (sec !== undefined && sec >= 0) sectionKeys.push(`${url}#${sec}`);
  }
  return { sectionTsx: chosen.sectionTsx, sectionKeys };
}

function sectionKeysFromMemberIds(
  memberIds: string[],
  sections: { url: string; sections: { id: string }[] }[],
): string[] {
  const keys: string[] = [];
  for (const memberId of memberIds) {
    const parsed = parseSectionMemberId(memberId);
    if (!parsed) continue;
    const sectionIdx = sections.find(p => p.url === parsed.url)?.sections.findIndex(s => s.id === parsed.sectionId);
    if (sectionIdx !== undefined && sectionIdx >= 0) keys.push(`${parsed.url}#${sectionIdx}`);
  }
  return keys;
}

function parseSectionMemberId(memberId: string): { url: string; sectionId: string } | null {
  const hashIndex = memberId.lastIndexOf("#");
  if (hashIndex <= 0 || hashIndex === memberId.length - 1) return null;
  return {
    url: memberId.slice(0, hashIndex),
    sectionId: memberId.slice(hashIndex + 1),
  };
}

function findSectionCandidate(args: {
  url: string;
  sectionId: string;
  pagesDir: string;
  slugByUrl: Map<string, string>;
  sections: { url: string; sections: { id: string }[] }[];
}): { sectionIdx: number; sectionTsx: string } | null {
  const slug = args.slugByUrl.get(args.url);
  if (!slug) return null;
  const pageSections = args.sections.find(p => p.url === args.url);
  if (!pageSections) return null;
  const sectionIdx = pageSections.sections.findIndex(s => s.id === args.sectionId);
  if (sectionIdx < 0) return null;
  const sectionTsx = pickSectionTsxForMember({
    generatedDir: join(args.pagesDir, slug, "generated"),
    sectionId: args.sectionId,
  })?.tsx;
  return sectionTsx ? { sectionIdx, sectionTsx } : null;
}

const ASSET_REF_RE = /["'](\/[^"']+\.(?:png|jpe?g|webp|svg|gif|avif|woff2?|mp4|webm|ico)(?:\?[^"']*)?)["']/gi;

function checkAssetReferences(targetDir: string): { passed: boolean; detail?: string } {
  const refs = new Set<string>();
  for (const dir of [join(targetDir, "src/components"), join(targetDir, "src/app")]) {
    collectAssetReferences(dir, refs);
  }

  const missing: string[] = [];
  for (const ref of refs) {
    const pathOnly = decodeAssetRef(ref).split("?")[0];
    if (!existsSync(join(targetDir, "public", pathOnly.replace(/^\//, "")))) {
      missing.push(pathOnly);
    }
  }

  if (missing.length === 0) return { passed: true };
  return {
    passed: false,
    detail: JSON.stringify({
      totalRefs: refs.size,
      missingCount: missing.length,
      samples: missing.slice(0, 10),
    }),
  };
}

function collectAssetReferences(dir: string, refs: Set<string>): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      collectAssetReferences(path, refs);
      continue;
    }
    if (!/\.(tsx|ts|css)$/.test(entry)) continue;
    const text = readFileSync(path, "utf8");
    let match: RegExpExecArray | null;
    while ((match = ASSET_REF_RE.exec(text)) !== null) refs.add(match[1]);
  }
}

function decodeAssetRef(ref: string): string {
  try {
    return decodeURIComponent(ref);
  } catch {
    return ref;
  }
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
