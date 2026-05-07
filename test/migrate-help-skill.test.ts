import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";

function repoPath(path: string): string {
  return join(process.cwd(), path);
}

function readRepoFile(path: string): string {
  return readFileSync(repoPath(path), "utf8");
}

describe("migrate-help skill", () => {
  it("does not register a legacy command wrapper", () => {
    expect(existsSync(repoPath("commands/migrate-help.md"))).toBe(false);
  });

  it("documents static workflow help and a context-aware final paragraph", () => {
    const skill = matter(readRepoFile("skills/migrate-help/SKILL.md"));

    expect(skill.data.name).toBe("migrate-help");
    expect(skill.data["disable-model-invocation"]).toBe(true);
    expect(skill.content).toContain("# migrate-help");
    expect(skill.content).toContain("/migrate:new <url>");
    expect(skill.content).toContain("/migrate:continue");
    expect(skill.content).toContain("/migrate:status");
    expect(skill.content).toContain("Phase 1");
    expect(skill.content).toContain("Recovery tools");
    expect(skill.content).toContain("advanced recovery tools, not the normal product workflow");
    expect(skill.content).toContain("Context-aware final paragraph");
    expect(skill.content).toContain("No migration in this directory");
    expect(skill.content).not.toContain("/migrate:config");
    expect(skill.content).not.toContain("mode attended|unattended");
    expect(skill.content).not.toContain("goal wireframe|pixel-perfect");
    expect(skill.content).not.toContain("Goal presets");
  });
});
