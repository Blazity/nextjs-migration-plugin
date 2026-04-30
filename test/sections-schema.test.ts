import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DiscoveredSectionsSchema } from "../schemas/sections.ts";

const readFixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("DiscoveredSectionsSchema", () => {
  it("accepts a valid sections probe", () => {
    const result = DiscoveredSectionsSchema.safeParse(readFixture("sections-valid.json"));
    expect(result.success).toBe(true);
  });

  it("rejects a non-ISO probedAt", () => {
    const result = DiscoveredSectionsSchema.safeParse(readFixture("sections-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("probedAt"))).toBe(true);
    }
  });

  it("rejects a non-URL page url", () => {
    const result = DiscoveredSectionsSchema.safeParse(readFixture("sections-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.join(".") === "pages.0.url")).toBe(true);
    }
  });

  it("rejects a section without an id", () => {
    const bad = {
      probedAt: "2026-04-30T12:00:00.000Z",
      pages: [{
        url: "https://example.com/",
        sections: [{ selector: "x", tagSkeleton: "x", pathShingles: [], boundingBox: { x: 0, y: 0, width: 1, height: 1 } }],
      }],
    };
    const result = DiscoveredSectionsSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.join(".").endsWith("id"))).toBe(true);
    }
  });
});
