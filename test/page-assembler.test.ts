import { describe, it, expect } from "vitest";
import { groupRoutesByNextRoute, assemblePageTsx } from "../lib/page-assembler.ts";

describe("groupRoutesByNextRoute", () => {
  it("collapses routes that share a nextRoute into a single group", () => {
    const groups = groupRoutesByNextRoute([
      { sourceUrl: "https://x.com/", nextRoute: "/", params: {}, kind: "static" },
      { sourceUrl: "https://x.com/blog/a", nextRoute: "/blog/[slug]", params: { slug: "a" }, kind: "dynamic" },
      { sourceUrl: "https://x.com/blog/b", nextRoute: "/blog/[slug]", params: { slug: "b" }, kind: "dynamic" },
    ]);
    expect(groups).toEqual([
      { nextRoute: "/", kind: "static", entries: [{ sourceUrl: "https://x.com/", params: {} }] },
      { nextRoute: "/blog/[slug]", kind: "dynamic", entries: [
        { sourceUrl: "https://x.com/blog/a", params: { slug: "a" } },
        { sourceUrl: "https://x.com/blog/b", params: { slug: "b" } },
      ]},
    ]);
  });
});

describe("assemblePageTsx", () => {
  it("emits a static page that imports the listed components and renders them in order", () => {
    const tsx = assemblePageTsx({
      group: { nextRoute: "/", kind: "static", entries: [{ sourceUrl: "https://x.com/", params: {} }] },
      sectionRefs: [{ componentName: "PageHero" }, { componentName: "Footer" }],
    });
    expect(tsx).toContain('import PageHero from "@/components/PageHero"');
    expect(tsx).toContain('import Footer from "@/components/Footer"');
    expect(tsx).toContain("<PageHero />");
    expect(tsx).toContain("<Footer />");
    expect(tsx).toMatch(/export default function Page\(\)/);
  });

  it("emits a dynamic page with generateStaticParams listing every group entry's params", () => {
    const tsx = assemblePageTsx({
      group: {
        nextRoute: "/blog/[slug]",
        kind: "dynamic",
        entries: [
          { sourceUrl: "https://x.com/blog/a", params: { slug: "a" } },
          { sourceUrl: "https://x.com/blog/b", params: { slug: "b" } },
        ],
      },
      sectionRefs: [{ componentName: "PageHero" }],
    });
    expect(tsx).toContain("export async function generateStaticParams()");
    expect(tsx).toContain('"slug":"a"');
    expect(tsx).toContain('"slug":"b"');
  });
});
