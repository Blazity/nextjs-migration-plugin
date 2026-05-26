import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { detectAppRouterRoot } from "./app-router-root.ts";
import { loadGlobalFoundation } from "./global-styles.ts";
import type { GlobalFoundation } from "../schemas/global-foundation.ts";

export interface WriteDesignSystemFoundationResult {
  applied: boolean;
  globalsCssPath: string;
  reason: string | null;
}

export function writeDesignSystemFoundation(args: {
  targetDir: string;
  globalsPath: string;
}): WriteDesignSystemFoundationResult {
  // Emit globals next to the layout that actually renders. Detect the
  // existing App Router root so a project scaffolded with `app/` doesn't
  // end up with two `globals.css` files where Next imports the wrong one.
  // See docs/issues/008.
  const router = detectAppRouterRoot(args.targetDir);
  const globalsCssPath = join(args.targetDir, router.globalsCssPath);
  const foundation = loadGlobalFoundation(args.globalsPath);
  if (!foundation.valid) {
    return {
      applied: false,
      globalsCssPath,
      reason: foundation.issues[0]?.message ?? "invalid global foundation",
    };
  }

  mkdirSync(dirname(globalsCssPath), { recursive: true });
  writeFileSync(globalsCssPath, renderDesignSystemFoundationCss(foundation.data));
  return {
    applied: true,
    globalsCssPath,
    reason: null,
  };
}

export function renderDesignSystemFoundationCss(foundation: GlobalFoundation): string {
  const body = foundation.body ?? {};
  const background = body.backgroundColor ?? "#ffffff";
  const foreground = body.color ?? "#171717";
  const fontFamily = body.fontFamily ?? foundation.fonts?.sans ?? "Arial, Helvetica, sans-serif";
  const fontSize = body.fontSize;
  const lineHeight = body.lineHeight;
  const fontWeight = body.fontWeight;

  // Heading family: pick the first heading element that declares one. Most
  // marketing sites use the same display face across h1–h6; differences
  // collapse safely into the same `--font-heading` token, and individual
  // rules below can still set per-level overrides if needed. See
  // docs/issues/007.
  const headingFamily = pickHeadingFontFamily(foundation.headings);
  const hasHeadingFamily = headingFamily !== null && headingFamily !== fontFamily;
  const headingTokenValue = hasHeadingFamily ? headingFamily : "var(--font-body)";

  const rootTokens = [
    ["background", background],
    ["foreground", foreground],
    ["font-body", fontFamily],
    ["font-heading", headingTokenValue],
    ...mapFlatTokens("source-color", foundation.colors),
    ...mapFlatTokens("source-radius", foundation.radii),
    ...mapFlatTokens("source-spacing", foundation.spacing),
    ...mapFlatTokens("source-font", foundation.fonts),
    ...mapFlatTokens("source-container", foundation.container),
    ...mapSectionPaddingTokens(foundation.sectionPadding),
  ];
  const themeTokens = [
    ["color-background", "var(--background)"],
    ["color-foreground", "var(--foreground)"],
    ["font-sans", "var(--font-body)"],
    ["font-display", "var(--font-heading)"],
    ...mapThemeRefs("color", foundation.colors),
    ...mapThemeRefs("radius", foundation.radii),
    ...mapThemeRefs("spacing", foundation.spacing),
    ...mapThemeRefs("font", foundation.fonts),
    ...mapThemeRefs("container", foundation.container),
    ...mapSectionPaddingThemeRefs(foundation.sectionPadding),
  ];
  const webkitFontSmoothing = body.webkitFontSmoothing;
  const mozOsxFontSmoothing = body.mozOsxFontSmoothing;
  const fontFeatureSettings = body.fontFeatureSettings;
  const optionalBodyLines = [
    fontSize ? `  font-size: ${fontSize};` : null,
    lineHeight ? `  line-height: ${lineHeight};` : null,
    fontWeight ? `  font-weight: ${fontWeight};` : null,
    // Font smoothing + feature settings round-tripped from production so
    // headings render at the same weight/sharpness. macOS Safari/Chrome
    // default to subpixel AA; production sites override to antialiased.
    // See docs/issues/007.
    webkitFontSmoothing ? `  -webkit-font-smoothing: ${webkitFontSmoothing};` : null,
    mozOsxFontSmoothing ? `  -moz-osx-font-smoothing: ${mozOsxFontSmoothing};` : null,
    fontFeatureSettings && fontFeatureSettings !== "normal"
      ? `  font-feature-settings: ${fontFeatureSettings};`
      : null,
  ].filter((line): line is string => Boolean(line));

  const fontFaceBlock = renderFontFaceBlock(foundation.fontFaces);
  const headingBlock = hasHeadingFamily
    ? `\nh1, h2, h3, h4, h5, h6 {\n  font-family: var(--font-heading);\n}\n`
    : "";

  return `@import "tailwindcss";
${fontFaceBlock}
:root {
${rootTokens.map(([name, value]) => `  --${name}: ${value};`).join("\n")}
}

@theme inline {
${themeTokens.map(([name, value]) => `  --${name}: ${value};`).join("\n")}
}

body {
  margin: 0;
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-body);
${optionalBodyLines.join("\n")}
}
${headingBlock}`;
}

function pickHeadingFontFamily(
  headings: GlobalFoundation["headings"],
): string | null {
  if (!headings) return null;
  for (const tag of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
    const family = headings[tag]?.fontFamily;
    if (family && family.trim().length > 0) return family;
  }
  return null;
}

function renderFontFaceBlock(fontFaces: GlobalFoundation["fontFaces"]): string {
  if (!fontFaces || fontFaces.length === 0) return "";
  const blocks = fontFaces.map(face => {
    const lines = [
      `  font-family: "${face.family}";`,
      `  src: ${face.src};`,
      face.weight ? `  font-weight: ${face.weight};` : null,
      face.style ? `  font-style: ${face.style};` : null,
      face.display ? `  font-display: ${face.display};` : null,
      face.unicodeRange ? `  unicode-range: ${face.unicodeRange};` : null,
    ].filter((line): line is string => Boolean(line));
    return `@font-face {\n${lines.join("\n")}\n}`;
  });
  return `\n${blocks.join("\n\n")}\n`;
}

function mapFlatTokens(prefix: string, values: Record<string, string> | undefined): Array<[string, string]> {
  return Object.entries(values ?? {}).map(([name, value]) => [`${prefix}-${cssTokenName(name)}`, value]);
}

function mapThemeRefs(prefix: string, values: Record<string, string> | undefined): Array<[string, string]> {
  return Object.keys(values ?? {}).map((name) => {
    const tokenName = cssTokenName(name);
    return [`${prefix}-${tokenName}`, `var(--source-${prefix}-${tokenName})`];
  });
}

function mapSectionPaddingTokens(
  sectionPadding: GlobalFoundation["sectionPadding"],
): Array<[string, string]> {
  return Object.entries(sectionPadding ?? {}).flatMap(([name, values]) =>
    Object.entries(values).map(([edge, value]) => [
      `source-section-${cssTokenName(name)}-${cssTokenName(edge)}`,
      value,
    ] as [string, string]),
  );
}

function mapSectionPaddingThemeRefs(
  sectionPadding: GlobalFoundation["sectionPadding"],
): Array<[string, string]> {
  return Object.entries(sectionPadding ?? {}).flatMap(([name, values]) =>
    Object.keys(values).map((edge) => {
      const sectionName = cssTokenName(name);
      const edgeName = cssTokenName(edge);
      return [
        `spacing-section-${sectionName}-${edgeName}`,
        `var(--source-section-${sectionName}-${edgeName})`,
      ] as [string, string];
    }),
  );
}

function cssTokenName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}
