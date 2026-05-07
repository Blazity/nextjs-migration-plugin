import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readSkill(name: string): string {
  return readFileSync(join(process.cwd(), "skills", name, "SKILL.md"), "utf8");
}

describe("migration skill contracts", () => {
  it("keeps the session log contract inside .migration only", () => {
    const skill = readSkill("migrate-build");

    expect(skill).toContain(".migration/SESSION_LOG.md");
    expect(skill).toContain("must not create a root `SESSION-LOG.md`");
  });

  it("auto-continues after migrate:new when mode is unattended", () => {
    const skill = readSkill("migrate-new");

    expect(skill).toContain("If `${MODE}` is `unattended`, immediately invoke `/migrate:continue`");
    expect(skill).not.toContain("This skill ONLY bootstraps the migration. Do not automatically invoke");
  });

  it("requires scaffold creation before .migration when the target lacks a Next.js scaffold", () => {
    const skill = readSkill("migrate-new");

    expect(skill).toContain("scaffold before invoking the entry script");
    expect(skill).toContain("before `.migration/` exists");
  });

  it("asks for pages to migrate during migrate:new intake", () => {
    const skill = readSkill("migrate-new");

    expect(skill).toContain("Ask the five wizard questions");
    expect(skill).toContain("Pages to migrate");
    expect(skill).toContain("--initial-page-selection");
    expect(skill).not.toContain("Ask the four wizard questions");
  });

  it("does not allow Phase 5 baseline failures to be manually waived", () => {
    const skill = readSkill("migrate-continue");

    expect(skill).not.toContain("Phase 5's gate accepts wireframe quality on the homepage");
    expect(skill).toContain("Do not mark Phase 5 complete when `verify-build-baseline` fails");
  });

  it("documents Phase 6 visual polish without claiming animations or perf are done", () => {
    const command = readFileSync(join(process.cwd(), "commands/migrate-polish.md"), "utf8");
    const skill = readSkill("migrate-polish");

    expect(command).toContain("[slug|--all]");
    expect(skill).toContain("Hard-require Playwright MCP");
    expect(skill).toContain("Phase 6 Visual only");
    expect(skill).toContain("Phase 7 Animate and Phase 8 Perf remain pending");
    expect(skill).not.toContain("full pixel-perfect migration complete");
  });
});
