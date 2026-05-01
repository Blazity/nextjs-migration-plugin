import type { Layouts } from "../schemas/layouts.ts";
import type { Components } from "../schemas/components.ts";
import type { Routes } from "../schemas/routes.ts";
import type { SiteFrontmatter } from "../schemas/site.ts";
import type { RoadmapItem } from "../schemas/roadmap.ts";

export interface BuildOrderInput {
  layouts: Layouts;
  components: Components;
  routes: Routes;
  goal: SiteFrontmatter["goal"];
}

export function buildOrder(input: BuildOrderInput): RoadmapItem[] {
  const items: RoadmapItem[] = [];

  // 1. Layout shells first — pages depend on them.
  for (const slot of ["header", "footer", "nav"] as const) {
    const shell = input.layouts[slot];
    if (!shell) continue;
    items.push({
      kind: "layout",
      id: shell.id,
      name: `${slot}: ${shell.id}`,
      dependsOn: [],
    });
  }

  // 2. Components — alphabetical by name (v1: no inter-component deps).
  const sortedComponents = [...input.components.components]
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const c of sortedComponents) {
    items.push({
      kind: "component",
      id: c.id,
      name: c.name,
      dependsOn: [],
    });
  }

  // 3. Pages — depend on all layout shells + components (v1 conservative).
  const foundationIds = items.map(i => i.id);
  for (const r of input.routes.routes) {
    items.push({
      kind: "page",
      id: r.sourceUrl,
      name: r.nextRoute,
      dependsOn: [...foundationIds],
    });
  }

  // 4. Polish — only when goal is pixel-perfect; one entry per page.
  if (input.goal === "pixel-perfect") {
    for (const r of input.routes.routes) {
      items.push({
        kind: "polish",
        id: `polish:${r.sourceUrl}`,
        name: `polish ${r.nextRoute}`,
        dependsOn: [r.sourceUrl],
      });
    }
  }

  return items;
}

/**
 * Detect dependency cycles among RoadmapItems via DFS.
 * Returns an array of cycles; each cycle is the list of ids visited
 * starting from the first node that re-entered the recursion stack.
 * Ignores dependsOn references to ids that aren't present in `items`.
 */
export function detectCycles(items: RoadmapItem[]): string[][] {
  const itemById = new Map(items.map(i => [i.id, i]));
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];
  const cycles: string[][] = [];

  function visit(id: string): void {
    if (stack.has(id)) {
      const cycleStart = path.indexOf(id);
      cycles.push(path.slice(cycleStart));
      return;
    }
    if (visited.has(id)) return;
    if (!itemById.has(id)) return; // unknown id — ignore per contract
    visited.add(id);
    stack.add(id);
    path.push(id);
    for (const dep of itemById.get(id)!.dependsOn) {
      visit(dep);
    }
    path.pop();
    stack.delete(id);
  }

  for (const item of items) visit(item.id);
  return cycles;
}
