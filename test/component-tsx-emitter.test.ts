import { describe, it, expect } from "vitest";
import {
  planComponentFiles,
  sanitizeComponentName,
  validateApprovedName,
} from "../lib/component-tsx-emitter.ts";

describe("sanitizeComponentName", () => {
  it("PascalCases hyphens and strips non-ascii", () => {
    expect(sanitizeComponentName("page-hero")).toBe("PageHero");
    expect(sanitizeComponentName("Café Header")).toBe("CafeHeader");
  });

  it("falls back to Component<index> when input is empty or all-symbol", () => {
    expect(sanitizeComponentName("", 3)).toBe("Component3");
    expect(sanitizeComponentName("---", 7)).toBe("Component7");
  });
});

describe("validateApprovedName", () => {
  it("rejects ID-like, generic, empty, or non-PascalCase names", () => {
    for (const name of ["Component3", "p0-s0", "Section1", "", "pricingCard"]) {
      expect(validateApprovedName(name)).toEqual({
        ok: false,
        reason: "implementation name must be semantic PascalCase",
      });
    }
  });

  it("accepts semantic PascalCase component names", () => {
    expect(validateApprovedName("Hero")).toEqual({ ok: true });
    expect(validateApprovedName("PricingCard")).toEqual({ ok: true });
  });
});

describe("planComponentFiles", () => {
  it("maps each component id to a target path under src/components/<Name>.tsx", () => {
    const plan = planComponentFiles({
      components: [
        { id: "cluster-hero", name: "page-hero", memberSections: [{ id: "p0-s0", url: "u" }, { id: "p1-s0", url: "u2" }] },
        { id: "cluster-cta", name: "", memberSections: [{ id: "p0-s5", url: "u" }] },
      ],
    });
    expect(plan).toEqual([
      { id: "cluster-hero", name: "PageHero", filePath: "src/components/PageHero.tsx", memberCount: 2 },
      { id: "cluster-cta", name: "Component1", filePath: "src/components/Component1.tsx", memberCount: 1 },
    ]);
  });
});
