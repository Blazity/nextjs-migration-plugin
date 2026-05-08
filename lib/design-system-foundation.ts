import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
  const globalsCssPath = join(args.targetDir, "src/app/globals.css");
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
  const rootTokens = [
    ["background", background],
    ["foreground", foreground],
    ["font-body", fontFamily],
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
    ...mapThemeRefs("color", foundation.colors),
    ...mapThemeRefs("radius", foundation.radii),
    ...mapThemeRefs("spacing", foundation.spacing),
    ...mapThemeRefs("font", foundation.fonts),
    ...mapThemeRefs("container", foundation.container),
    ...mapSectionPaddingThemeRefs(foundation.sectionPadding),
  ];
  const optionalBodyLines = [
    fontSize ? `  font-size: ${fontSize};` : null,
    lineHeight ? `  line-height: ${lineHeight};` : null,
    fontWeight ? `  font-weight: ${fontWeight};` : null,
  ].filter((line): line is string => Boolean(line));

  return `@import "tailwindcss";

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
`;
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
