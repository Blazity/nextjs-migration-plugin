import { describe, it, expect } from "vitest";
import { buildRoutes } from "../lib/route-map.ts";

describe("buildRoutes", () => {
  it("emits a static route for the seed origin", () => {
    const routes = buildRoutes(["https://example.com/"]);
    expect(routes).toEqual([
      { sourceUrl: "https://example.com/", nextRoute: "/", params: {}, kind: "static" },
    ]);
  });

  it("emits static routes for distinct single-segment paths", () => {
    const routes = buildRoutes([
      "https://example.com/",
      "https://example.com/about",
      "https://example.com/pricing",
    ]);
    const map = Object.fromEntries(routes.map(r => [r.sourceUrl, r.nextRoute]));
    expect(map["https://example.com/about"]).toBe("/about");
    expect(map["https://example.com/pricing"]).toBe("/pricing");
    expect(routes.every(r => r.kind === "static")).toBe(true);
  });

  it("collapses sibling URLs with a varying tail segment into a [slug] dynamic route", () => {
    const routes = buildRoutes([
      "https://example.com/case-study/cookunity",
      "https://example.com/case-study/vibes",
      "https://example.com/case-study/arthurai",
    ]);
    expect(routes.every(r => r.kind === "dynamic")).toBe(true);
    expect(routes.every(r => r.nextRoute === "/case-study/[slug]")).toBe(true);
    const slugs = routes.map(r => r.params.slug).sort();
    expect(slugs).toEqual(["arthurai", "cookunity", "vibes"]);
  });

  it("does not collapse a 2-URL group into a dynamic pattern (threshold = 3)", () => {
    const routes = buildRoutes([
      "https://example.com/case-study/cookunity",
      "https://example.com/case-study/vibes",
    ]);
    expect(routes.every(r => r.kind === "static")).toBe(true);
  });

  it("handles an index page alongside its dynamic siblings", () => {
    const routes = buildRoutes([
      "https://example.com/case-study",
      "https://example.com/case-study/cookunity",
      "https://example.com/case-study/vibes",
      "https://example.com/case-study/arthurai",
    ]);
    const index = routes.find(r => r.sourceUrl === "https://example.com/case-study");
    expect(index?.nextRoute).toBe("/case-study");
    expect(index?.kind).toBe("static");
    const dynamics = routes.filter(r => r.kind === "dynamic");
    expect(dynamics).toHaveLength(3);
    expect(dynamics.every(r => r.nextRoute === "/case-study/[slug]")).toBe(true);
  });
});
