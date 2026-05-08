import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function readSkill(name: string): string {
  return readFileSync(join(process.cwd(), "skills", name, "SKILL.md"), "utf8");
}

function readRepoFile(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function expectNoStaleGuidedFlowTerms(content: string, label: string): void {
  const normalized = content.toLowerCase();
  for (const term of [
    "attended",
    "unattended",
    "wireframe",
    "pixel-perfect",
    "--mode",
    "--goal",
    "--confirm-roadmap",
    "mode:",
    "goal:",
    "**mode.**",
    "**goal.**",
    "user confirmed page list",
  ]) {
    expect(normalized, label).not.toContain(term);
  }
}

describe("migration skill contracts", () => {
  it("exposes only the four guided-flow command wrappers", () => {
    expect(readdirSync(join(process.cwd(), "commands")).sort()).toEqual([
      "migrate-continue.md",
      "migrate-help.md",
      "migrate-new.md",
      "migrate-status.md",
    ]);
  });

  it("exposes only guided-flow user skills", () => {
    expect(readdirSync(join(process.cwd(), "skills")).sort()).toEqual([
      "migrate-continue",
      "migrate-help",
      "migrate-new",
      "migrate-status",
    ]);
  });

  it("keeps plugin command and skill registration rooted in the reduced surface directories", () => {
    const plugin = JSON.parse(readRepoFile("plugin.json")) as { commands: string; skills: string };

    expect(plugin.commands).toBe("commands/");
    expect(plugin.skills).toBe("skills/");
  });

  it("keeps public command wrappers and README on the guided approval surface", () => {
    for (const path of [
      "commands/migrate-continue.md",
      "commands/migrate-status.md",
      "README.md",
    ]) {
      const content = readRepoFile(path);
      expect(content).not.toContain("/migrate:config");
      expect(content).not.toContain("unattended");
      expect(content).not.toContain("first incomplete phase");
      expect(content).not.toContain("phases complete");
    }
  });

  it("migrate:new no longer asks mode or goal questions", () => {
    const skill = readSkill("migrate-new");

    expect(skill).toContain("Ask the three wizard questions");
    expectNoStaleGuidedFlowTerms(skill, "migrate-new");
  });

  it("requires scaffold creation before .migration when the target lacks a Next.js scaffold", () => {
    const skill = readSkill("migrate-new");

    expect(skill).toContain("scaffold before invoking the entry script");
    expect(skill).toContain("before `.migration/` exists");
  });

  it("asks for pages to migrate during migrate:new intake", () => {
    const skill = readSkill("migrate-new");

    expect(skill).toContain("Ask the three wizard questions");
    expect(skill).toContain("Pages to migrate");
    expect(skill).toContain("--initial-page-selection");
    expect(skill).not.toContain("Ask the four wizard questions");
    expect(skill).not.toContain("Ask the five wizard questions");
  });

  it("reports Component Inventory Review as the migrate:new success checkpoint", () => {
    const skill = readSkill("migrate-new");

    expect(skill).toContain("inventory-decider");
    expect(skill).toContain("regenerateInventoryArtifacts");
    expect(skill).toContain("userFeedback");
    expect(skill).toContain("Open the Component Inventory Review at");
    expect(skill).toContain("reviewHtmlPath");
    expect(skill).toContain("describe any name or grouping changes in chat");
    expect(skill).not.toContain("/migrate:discover");
    expect(skill).not.toContain("the next message is the Component Inventory Review summary");
  });

  it("runs migrate:new without tsx so Playwright utility-world callbacks do not inherit esbuild __name helpers", () => {
    const skill = readSkill("migrate-new");

    expect(skill).toContain("node --experimental-strip-types");
    expect(skill).toContain("lib/new-migration.ts");
    expect(skill).not.toContain("tsx ${PLUGIN_DIR}/lib/new-migration.ts");
  });

  it("migrate:continue no longer branches on removed mode or goal settings", () => {
    const skill = readSkill("migrate-continue");

    expect(skill).toContain("approval-state scheduler");
    expect(skill).toContain("Component Inventory Review");
    expect(skill).toContain("Component Batch Approval");
    expect(skill).toContain("Page Layout Approval");
    expect(skill).not.toContain("Prefer the status/continue scripts");
    expect(skill).not.toContain("for `goal`");
    expectNoStaleGuidedFlowTerms(skill, "migrate-continue");
  });

  it("migrate:continue does not expose legacy phase dispatch gates", () => {
    const skill = readSkill("migrate-continue");

    for (const phase of [
      "phase-2-analyze",
      "phase-3-plan",
      "phase-4-extract",
      "phase-5-build",
      "phase-6-visual",
    ]) {
      expect(skill).not.toContain(phase);
    }
    expect(skill).not.toContain("VERIFICATION.md");
    expect(skill).not.toContain("verify-build-baseline");
  });

  it("routes inventory corrections through natural-language chat", () => {
    const skill = readSkill("migrate-continue");

    expect(skill).toContain("describe changes in chat");
    expect(skill).toContain("record the raw chat feedback in SESSION_LOG.md");
    expect(skill).toContain(".migration/decisions/");
    expect(skill).not.toContain("Run `/migrate:discover`");
    expect(skill).not.toContain("Run `/migrate:plan`");
  });

  it("defines a JSON-only inventory correction agent", () => {
    const agent = readRepoFile("agents/inventory-corrector.md");

    expect(agent).toContain("InventoryCorrection[]");
    expect(agent).toContain("free-text user description");
    expect(agent).toContain("Output JSON only");
    expect(agent).toContain("no prose");
    expect(agent).toContain("The LLM owns grouping, semantic naming, and correction intent");
    expect(agent).toContain("Tools provide evidence and enforce gates");
    expectNoStaleGuidedFlowTerms(agent, "inventory-corrector");
  });

  it("defines an LLM-led initial inventory decision agent", () => {
    const agent = readRepoFile("agents/inventory-decider.md");

    expect(agent).toContain("InventoryCorrection[]");
    expect(agent).toContain("initial Component Inventory Review");
    expect(agent).toContain("The LLM owns initial grouping, semantic naming, prop intent");
    expect(agent).toContain("Tools provide evidence and enforce gates");
    expect(agent).toContain("Do not approve the inventory");
    expectNoStaleGuidedFlowTerms(agent, "inventory-decider");
  });

  it("runtime prompts and knowledge do not preserve removed mode or goal choices", () => {
    for (const path of [
      "agents/site-crawler.md",
      "agents/migration-planner.md",
      "agents/plan-checker.md",
      "agents/phase-verifier.md",
      "knowledge/phase-pitfalls/discover.md",
      "knowledge/phase-pitfalls/plan.md",
      "knowledge/phase-pitfalls/extract.md",
      "knowledge/phase-pitfalls/build.md",
      "knowledge/phase-pitfalls/visual.md",
    ]) {
      expectNoStaleGuidedFlowTerms(readRepoFile(path), path);
    }
  });
});
