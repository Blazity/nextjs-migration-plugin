import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRoadmap } from "../lib/load-roadmap.ts";

function tempRoadmapMd(frontmatterJson: object, body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "roadmap-load-"));
  const path = join(dir, "ROADMAP.md");
  const fm = ["---"];
  const fmJson = frontmatterJson as {
    generatedAt: string;
    parallelism: { maxParallelPages: number; maxParallelSections: number };
    buildOrder: Array<{ kind: string; id: string; name: string; dependsOn?: string[] }>;
  };
  fm.push(`generatedAt: "${fmJson.generatedAt}"`);
  fm.push("parallelism:");
  fm.push(`  maxParallelPages: ${fmJson.parallelism.maxParallelPages}`);
  fm.push(`  maxParallelSections: ${fmJson.parallelism.maxParallelSections}`);
  fm.push("buildOrder:");
  for (const item of fmJson.buildOrder) {
    fm.push(`  - kind: ${item.kind}`);
    fm.push(`    id: "${item.id}"`);
    fm.push(`    name: "${item.name}"`);
    fm.push(`    dependsOn: ${JSON.stringify(item.dependsOn ?? [])}`);
  }
  fm.push("resolvedQuestions: []");
  fm.push("---", "", body, "");
  writeFileSync(path, fm.join("\n"));
  return path;
}

describe("loadRoadmap", () => {
  it("returns { valid: true } for a valid ROADMAP.md", () => {
    const path = tempRoadmapMd({
      generatedAt: "2026-05-01T12:00:00.000Z",
      parallelism: { maxParallelPages: 4, maxParallelSections: 4 },
      buildOrder: [
        { kind: "component", id: "cluster-hero", name: "Hero", dependsOn: [] },
      ],
    }, "# Roadmap body for human reading\n");
    const result = loadRoadmap(path);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect("goal" in result.data).toBe(false);
      expect("mode" in result.data).toBe(false);
      expect(result.data.buildOrder).toHaveLength(1);
    }
  });

  it("returns { valid: false } for invalid frontmatter", () => {
    const dir = mkdtempSync(join(tmpdir(), "roadmap-load-"));
    const path = join(dir, "ROADMAP.md");
    writeFileSync(path, "---\ngeneratedAt: today\n---\nbody\n");
    const result = loadRoadmap(path);
    expect(result.valid).toBe(false);
  });
});
