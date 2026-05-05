import { describe, it, expect } from "vitest";
import { assembleRootLayoutTsx } from "../lib/layout-assembler.ts";

describe("assembleRootLayoutTsx", () => {
  it("returns null when no header / footer / nav layout slots are populated", () => {
    const result = assembleRootLayoutTsx({ header: null, footer: null, nav: null });
    expect(result).toBeNull();
  });

  it("emits a layout that wraps {children} between Header and Footer when both slots are populated", () => {
    const tsx = assembleRootLayoutTsx({
      header: { componentName: "SiteHeader" },
      footer: { componentName: "SiteFooter" },
      nav: null,
    });
    expect(tsx).toContain('import SiteHeader from "@/components/SiteHeader"');
    expect(tsx).toContain('import SiteFooter from "@/components/SiteFooter"');
    expect(tsx).toMatch(/<SiteHeader \/>\s*\{children\}\s*<SiteFooter \/>/);
    expect(tsx).toContain("export default function RootLayout");
  });

  it("prepends `import \"./globals.css\"` so Tailwind compiles into the route bundle (issue 011)", () => {
    const tsx = assembleRootLayoutTsx({
      header: { componentName: "Header" }, footer: null, nav: null,
    });
    expect(tsx).not.toBeNull();
    if (!tsx) return;
    const cssIdx = tsx.indexOf('import "./globals.css"');
    const componentIdx = tsx.indexOf("import Header from");
    expect(cssIdx).toBeGreaterThanOrEqual(0);
    expect(cssIdx).toBeLessThan(componentIdx);
  });
});
