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
  it("registers the guided-flow help command wrapper", () => {
    expect(existsSync(repoPath("commands/migrate-help.md"))).toBe(true);
  });

  it("documents only the four-command guided flow and a recovery note", () => {
    const skill = matter(readRepoFile("skills/migrate-help/SKILL.md"));
    const commands = [...new Set(skill.content.match(/\/migrate:[a-z]+/g) ?? [])].sort();

    expect(skill.data.name).toBe("migrate-help");
    expect(skill.data["disable-model-invocation"]).toBe(true);
    expect(skill.content).toContain("# migrate-help");
    expect(commands).toEqual([
      "/migrate:continue",
      "/migrate:help",
      "/migrate:new",
      "/migrate:status",
    ]);
    expect(skill.content).toContain("guided flow");
    expect(skill.content).toContain("Recovery");
    expect(skill.content).toContain("lower-level scripts");
    expect(skill.content).toContain("advanced/recovery tools");
    expect(skill.content).toContain("Context-aware final paragraph");
    expect(skill.content).toContain("No migration in this directory");
    expect(skill.content).not.toContain("/migrate:config");
    expect(skill.content).not.toContain("/migrate:discover");
    expect(skill.content).not.toContain("/migrate:analyze");
    expect(skill.content).not.toContain("/migrate:plan");
    expect(skill.content).not.toContain("/migrate:extract");
    expect(skill.content).not.toContain("/migrate:build");
    expect(skill.content).not.toContain("/migrate:polish");
    expect(skill.content).not.toContain("/migrate:verify");
    expect(skill.content).not.toContain("Phase 1");
    expect(skill.content).not.toContain("completed phases");
    expect(skill.content).not.toContain("active run");
    expect(skill.content).not.toContain("mode attended|unattended");
    expect(skill.content).not.toContain("goal wireframe|pixel-perfect");
    expect(skill.content).not.toContain("Goal presets");
  });
});
