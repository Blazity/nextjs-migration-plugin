import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrationPaths } from "../lib/migration-paths.ts";

describe("migrationPaths", () => {
  it("returns canonical guided-flow state paths under .migration/", () => {
    const paths = migrationPaths("/proj");

    expect(Object.isFrozen(paths)).toBe(true);
    expect(paths.rawDiscovery).toBe(join("/proj", ".migration", "discovery", "sections.json"));
    expect(paths.draftInventory).toBe(join("/proj", ".migration", "inventory", "component-inventory.json"));
    expect(paths.reviewHtml).toBe(join("/proj", ".migration", "inventory", "inventory-review.html"));
    expect(paths.approvedInventory).toBe(join("/proj", ".migration", "approvals", "component-inventory.json"));
    expect(paths.componentApproval("hero")).toBe(join("/proj", ".migration", "approvals", "components", "hero.json"));
    expect(paths.pageApproval("pricing")).toBe(join("/proj", ".migration", "approvals", "pages", "pricing.json"));
    expect(paths.componentReference({
      sectionInstanceId: "hero-home",
      viewport: "1440",
    })).toBe(join("/proj", ".migration", "references", "components", "hero-home-1440.png"));
    expect(paths.approvedBaseline({
      kind: "component",
      slugOrName: "hero",
      viewport: "390",
    })).toBe(join("/proj", ".migration", "baselines", "component", "hero-390.png"));
  });
});
