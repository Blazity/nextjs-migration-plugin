import type { RouteEntry } from "../schemas/routes.ts";

const DYNAMIC_GROUP_THRESHOLD = 3;

export function buildRoutes(urls: string[]): RouteEntry[] {
  const parsed = urls.map(u => {
    const parsedUrl = new URL(u);
    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    return { url: u, segments };
  });

  // Group URLs by their parent path (everything except the last segment).
  const groups = new Map<string, typeof parsed>();
  for (const p of parsed) {
    if (p.segments.length === 0) {
      groups.set("__root__", [...(groups.get("__root__") ?? []), p]);
      continue;
    }
    const parent = "/" + p.segments.slice(0, -1).join("/");
    groups.set(parent, [...(groups.get(parent) ?? []), p]);
  }

  const dynamicParents = new Set<string>();
  for (const [parent, members] of groups) {
    if (parent === "__root__") continue;
    // Never promote the root parent ("/") to a `[slug]` group: top-level
    // single-segment pages (`/about`, `/services`, `/case-studies`,
    // `/privacy-policy`, …) are unrelated index pages, not a dynamic family.
    // Dynamic promotion only makes sense under an explicit collection prefix
    // like `/case-study/<slug>` or `/blog/<slug>`.
    if (parent === "/") continue;
    if (members.length >= DYNAMIC_GROUP_THRESHOLD) {
      dynamicParents.add(parent);
    }
  }

  return parsed.map((p): RouteEntry => {
    if (p.segments.length === 0) {
      return { sourceUrl: p.url, nextRoute: "/", params: {}, kind: "static" };
    }
    const parent = "/" + p.segments.slice(0, -1).join("/");
    if (dynamicParents.has(parent)) {
      const tail = p.segments[p.segments.length - 1];
      return {
        sourceUrl: p.url,
        nextRoute: `${parent === "/" ? "" : parent}/[slug]`,
        params: { slug: tail },
        kind: "dynamic",
      };
    }
    return {
      sourceUrl: p.url,
      nextRoute: "/" + p.segments.join("/"),
      params: {},
      kind: "static",
    };
  });
}
