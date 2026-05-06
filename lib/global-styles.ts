import { existsSync, readFileSync } from "node:fs";
import { GlobalFoundationSchema, type GlobalFoundation } from "../schemas/global-foundation.ts";
import type { LoadResult } from "../schemas/errors.ts";

export function loadGlobalFoundation(path: string): LoadResult<GlobalFoundation> {
  if (!existsSync(path)) {
    return { valid: false, path, rawJson: null, issues: [{ code: "custom", path: [], message: `Missing ${path}` }] };
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return {
      valid: false,
      path,
      rawJson: null,
      issues: [{
        code: "custom",
        path: [],
        message: `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`,
      }],
    };
  }

  const result = GlobalFoundationSchema.safeParse(rawJson);
  if (result.success) return { valid: true, data: result.data };
  return { valid: false, path, rawJson, issues: result.error.issues };
}

export function renderGlobalCss(foundation: GlobalFoundation): string {
  const body = foundation.body ?? {};
  const background = body.backgroundColor ?? "#ffffff";
  const foreground = body.color ?? "#171717";
  const fontFamily = body.fontFamily ?? "Arial, Helvetica, sans-serif";
  const fontSize = body.fontSize;
  const lineHeight = body.lineHeight;
  const fontWeight = body.fontWeight;

  const optionalBodyLines = [
    fontSize ? `  font-size: ${fontSize};` : null,
    lineHeight ? `  line-height: ${lineHeight};` : null,
    fontWeight ? `  font-weight: ${fontWeight};` : null,
  ].filter((line): line is string => Boolean(line));

  return `@import "tailwindcss";

:root {
  --background: ${background};
  --foreground: ${foreground};
}

body {
  margin: 0;
  background: var(--background);
  color: var(--foreground);
  font-family: ${fontFamily};
${optionalBodyLines.join("\n")}
}
`;
}
