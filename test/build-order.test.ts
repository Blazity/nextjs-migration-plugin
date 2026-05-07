import { describe, it, expect } from "vitest";
import { buildOrder, detectCycles } from "../lib/build-order.ts";
import type { Layouts } from "../schemas/layouts.ts";
import type { Components } from "../schemas/components.ts";
import type { Routes } from "../schemas/routes.ts";

const isoNow = new Date().toISOString();

const baseLayouts: Layouts = {
  header: null,
  footer: {
    id: "cluster-footer-1",
    signature: "footer-1",
    appearsOn: ["https://example.com/"],
    memberIds: ["https://example.com/#p0-s2"],
    tagSkeleton: "footer>div",
  },
  nav: null,
  updatedAt: isoNow,
};

const baseComponents: Components = {
  components: [
    {
      id: "cluster-hero",
      name: "Hero",
      signature: "hero",
      tagSkeleton: "section>div>h1",
      memberSections: [{ id: "p0-s0", url: "https://example.com/" }],
      unique: false,
      propsRef: "HeroProps",
    },
    {
      id: "cluster-card",
      name: "CaseStudyCard",
      signature: "card",
      tagSkeleton: "section>div>img",
      memberSections: [{ id: "p1-s0", url: "https://example.com/case" }],
      unique: false,
      propsRef: "CaseStudyCardProps",
    },
  ],
  updatedAt: isoNow,
};

const baseRoutes: Routes = {
  routes: [
    { sourceUrl: "https://example.com/", nextRoute: "/", params: {}, kind: "static" },
    { sourceUrl: "https://example.com/case", nextRoute: "/case", params: {}, kind: "static" },
  ],
  updatedAt: isoNow,
};

describe("buildOrder", () => {
  it("emits one entry per non-null layout slot, alphabetized component, and page", () => {
    const items = buildOrder({
      layouts: baseLayouts,
      components: baseComponents,
      routes: baseRoutes,
      goal: "wireframe",
    });
    const kinds = items.map(i => i.kind);
    expect(kinds.filter(k => k === "layout")).toHaveLength(1);
    expect(kinds.filter(k => k === "component")).toHaveLength(2);
    expect(kinds.filter(k => k === "page")).toHaveLength(2);
    expect(kinds.filter(k => k === "polish")).toHaveLength(0);
  });

  it("alphabetizes components by name", () => {
    const items = buildOrder({
      layouts: baseLayouts,
      components: baseComponents,
      routes: baseRoutes,
      goal: "wireframe",
    });
    const componentNames = items.filter(i => i.kind === "component").map(i => i.name);
    expect(componentNames).toEqual(["CaseStudyCard", "Hero"]);
  });

  it("places layouts and components before pages in the build order", () => {
    const items = buildOrder({
      layouts: baseLayouts,
      components: baseComponents,
      routes: baseRoutes,
      goal: "wireframe",
    });
    const firstPageIdx = items.findIndex(i => i.kind === "page");
    let lastNonPageIdx = -1;
    for (let i = 0; i < items.length; i++) {
      const k = items[i].kind;
      if (k !== "page" && k !== "polish") lastNonPageIdx = i;
    }
    expect(lastNonPageIdx).toBeLessThan(firstPageIdx);
  });

  it("makes pages depend on every layout + component id", () => {
    const items = buildOrder({
      layouts: baseLayouts,
      components: baseComponents,
      routes: baseRoutes,
      goal: "wireframe",
    });
    const allFoundationIds = new Set(
      items.filter(i => i.kind === "layout" || i.kind === "component").map(i => i.id),
    );
    const pages = items.filter(i => i.kind === "page");
    for (const p of pages) {
      for (const id of allFoundationIds) {
        expect(p.dependsOn).toContain(id);
      }
    }
  });

  it("emits one polish entry per page when goal is pixel-perfect", () => {
    const items = buildOrder({
      layouts: baseLayouts,
      components: baseComponents,
      routes: baseRoutes,
      goal: "pixel-perfect",
    });
    const polish = items.filter(i => i.kind === "polish");
    expect(polish).toHaveLength(2);
    expect(polish[0].dependsOn).toContain("https://example.com/");
  });

  it("emits no polish entries when goal is wireframe", () => {
    const items = buildOrder({
      layouts: baseLayouts,
      components: baseComponents,
      routes: baseRoutes,
      goal: "wireframe",
    });
    expect(items.filter(i => i.kind === "polish")).toHaveLength(0);
  });

  it("skips null layout slots", () => {
    const layouts: Layouts = { ...baseLayouts, footer: null, header: null, nav: null };
    const items = buildOrder({
      layouts,
      components: baseComponents,
      routes: baseRoutes,
      goal: "wireframe",
    });
    expect(items.filter(i => i.kind === "layout")).toHaveLength(0);
  });
});

describe("detectCycles", () => {
  it("returns no cycles for an acyclic build order", () => {
    const items = buildOrder({
      layouts: baseLayouts,
      components: baseComponents,
      routes: baseRoutes,
      goal: "wireframe",
    });
    expect(detectCycles(items)).toEqual([]);
  });

  it("detects a 2-node cycle", () => {
    const cycles = detectCycles([
      { kind: "component", id: "a", name: "A", dependsOn: ["b"] },
      { kind: "component", id: "b", name: "B", dependsOn: ["a"] },
    ]);
    expect(cycles.length).toBeGreaterThanOrEqual(1);
    expect(cycles[0].sort()).toEqual(["a", "b"]);
  });

  it("ignores dependsOn references to ids that do not exist", () => {
    const cycles = detectCycles([
      { kind: "component", id: "a", name: "A", dependsOn: ["ghost"] },
    ]);
    expect(cycles).toEqual([]);
  });
});
