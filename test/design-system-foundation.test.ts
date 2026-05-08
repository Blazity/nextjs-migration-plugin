import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  renderDesignSystemFoundationCss,
  writeDesignSystemFoundation,
} from "../lib/design-system-foundation.ts";

describe("design-system foundation", () => {
  it("renders source-derived named Tailwind theme tokens and body defaults", () => {
    const css = renderDesignSystemFoundationCss({
      body: {
        backgroundColor: "rgb(255, 255, 255)",
        color: "rgb(17, 24, 39)",
        fontFamily: "Inter, sans-serif",
        fontSize: "16px",
        lineHeight: "1.5",
        fontWeight: "400",
      },
      colors: {
        brand: "rgb(42, 91, 255)",
      },
      radii: {
        card: "16px",
      },
      spacing: {
        stack: "24px",
      },
      container: {
        page: "1200px",
      },
      sectionPadding: {
        large: { top: "96px", bottom: "112px" },
      },
    });

    expect(css).toContain('@import "tailwindcss";');
    expect(css).toContain("--background: rgb(255, 255, 255);");
    expect(css).toContain("--foreground: rgb(17, 24, 39);");
    expect(css).toContain("--source-color-brand: rgb(42, 91, 255);");
    expect(css).toContain("--source-radius-card: 16px;");
    expect(css).toContain("--source-spacing-stack: 24px;");
    expect(css).toContain("--source-container-page: 1200px;");
    expect(css).toContain("--source-section-large-top: 96px;");
    expect(css).toContain("@theme inline");
    expect(css).toContain("--color-brand: var(--source-color-brand);");
    expect(css).toContain("--radius-card: var(--source-radius-card);");
    expect(css).toContain("--spacing-stack: var(--source-spacing-stack);");
    expect(css).toContain("--spacing-section-large-top: var(--source-section-large-top);");
    expect(css).toContain("--container-page: var(--source-container-page);");
    expect(css).not.toContain("prefers-color-scheme");
  });

  it("writes globals.css from an extracted 00-globals.json", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "design-foundation-"));
    const globalsPath = join(targetDir, ".migration/pages/home/spec/00-globals.json");
    mkdirSync(join(targetDir, ".migration/pages/home/spec"), { recursive: true });
    writeFileSync(globalsPath, JSON.stringify({
      body: { backgroundColor: "#fff", color: "#111" },
      colors: { accent: "#3366ff" },
    }, null, 2), { flag: "w" });

    const result = writeDesignSystemFoundation({ targetDir, globalsPath });

    expect(result.applied).toBe(true);
    const css = readFileSync(join(targetDir, "src/app/globals.css"), "utf8");
    expect(css).toContain("--source-color-accent: #3366ff;");
  });
});
