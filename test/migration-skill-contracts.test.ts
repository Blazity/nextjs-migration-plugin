import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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
  it("keeps the session log contract inside .migration only", () => {
    const skill = readSkill("migrate-build");

    expect(skill).toContain(".migration/SESSION_LOG.md");
    expect(skill).toContain("must not create a root `SESSION-LOG.md`");
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

    expect(skill).toContain("Open the Component Inventory Review at");
    expect(skill).toContain("reviewHtmlPath");
    expect(skill).toContain("describe any name or grouping changes in chat");
    expect(skill).not.toContain("/migrate:discover");
    expect(skill).not.toContain("the next message is the Component Inventory Review summary");
  });

  it("migrate:continue no longer branches on removed mode or goal settings", () => {
    const skill = readSkill("migrate-continue");

    expect(skill).toContain("Do not invoke `lib/continue.ts` during this step");
    expect(skill).toContain("The first phase whose `VERIFICATION.md` is missing is next");
    expect(skill).not.toContain("Prefer the status/continue scripts");
    expect(skill).not.toContain("for `goal`");
    expectNoStaleGuidedFlowTerms(skill, "migrate-continue");
  });

  it("does not allow Phase 5 baseline failures to be manually waived", () => {
    const skill = readSkill("migrate-continue");

    expect(skill).not.toContain("Phase 5's gate accepts wireframe quality on the homepage");
    expect(skill).toContain("Do not mark Phase 5 complete when `verify-build-baseline` fails");
  });

  it("recovery phase skills no longer document removed mode or roadmap-approval flow", () => {
    const discover = readSkill("migrate-discover");
    const plan = readSkill("migrate-plan");
    const config = readSkill("migrate-config");
    const configCommand = readFileSync(join(process.cwd(), "commands/migrate-config.md"), "utf8");

    for (const [label, content] of [["migrate-discover", discover], ["migrate-plan", plan]]) {
      expectNoStaleGuidedFlowTerms(content, label);
    }
    expect(config).not.toContain("`mode`");
    expect(config).not.toContain("`goal`");
    expect(configCommand).not.toContain("mode");
    expect(configCommand).not.toContain("goal");
  });

  it("legacy phase command metadata is labeled as recovery", () => {
    for (const path of [
      "commands/migrate-discover.md",
      "commands/migrate-analyze.md",
      "commands/migrate-plan.md",
      "commands/migrate-extract.md",
      "commands/migrate-build.md",
      "commands/migrate-polish.md",
      "commands/migrate-verify.md",
    ]) {
      expect(readRepoFile(path)).toContain("description: Recovery tool:");
    }
  });

  it("runtime prompts and knowledge do not preserve removed mode or goal choices", () => {
    for (const path of [
      "agents/site-crawler.md",
      "agents/migration-planner.md",
      "agents/plan-checker.md",
      "agents/phase-verifier.md",
      "skills/migrate-verify/SKILL.md",
      "skills/migrate-extract/SKILL.md",
      "skills/migrate-polish/SKILL.md",
      "knowledge/phase-pitfalls/discover.md",
      "knowledge/phase-pitfalls/plan.md",
      "knowledge/phase-pitfalls/extract.md",
      "knowledge/phase-pitfalls/build.md",
      "knowledge/phase-pitfalls/visual.md",
    ]) {
      expectNoStaleGuidedFlowTerms(readRepoFile(path), path);
    }
  });

  it("documents Phase 6 visual polish without claiming animations or perf are done", () => {
    const command = readFileSync(join(process.cwd(), "commands/migrate-polish.md"), "utf8");
    const skill = readSkill("migrate-polish");

    expect(command).toContain("[slug|--all]");
    expect(skill).toContain("Hard-require Playwright MCP");
    expect(skill).toContain("Phase 6 Visual only");
    expect(skill).toContain("Phase 7 Animate and Phase 8 Perf remain pending");
    expect(skill).not.toContain("full migration complete");
  });
});
