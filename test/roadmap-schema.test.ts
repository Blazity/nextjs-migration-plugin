import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { RoadmapSchema } from "../schemas/roadmap.ts";

const readFixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("RoadmapSchema", () => {
  it("accepts a valid roadmap", () => {
    expect(RoadmapSchema.safeParse(readFixture("roadmap-valid.json")).success).toBe(true);
  });

  it("rejects an invalid goal enum value", () => {
    const result = RoadmapSchema.safeParse(readFixture("roadmap-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("goal"))).toBe(true);
    }
  });

  it("rejects an empty buildOrder array", () => {
    const result = RoadmapSchema.safeParse(readFixture("roadmap-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.join(".") === "buildOrder")).toBe(true);
    }
  });

  it("rejects non-positive parallelism values", () => {
    const result = RoadmapSchema.safeParse(readFixture("roadmap-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.join(".").startsWith("parallelism."))).toBe(true);
    }
  });

  it("rejects an unknown buildOrder kind", () => {
    const bad = {
      goal: "wireframe",
      mode: "unattended",
      buildOrder: [{ kind: "ghost", id: "x", name: "X", dependsOn: [] }],
      parallelism: { maxParallelPages: 4, maxParallelSections: 4 },
      generatedAt: "2026-05-01T12:00:00.000Z",
    };
    const result = RoadmapSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.join(".").endsWith("kind"))).toBe(true);
    }
  });
});
