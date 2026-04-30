import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PhaseVerificationSchema, type PhaseVerification } from "../schemas/phase.ts";

export async function writePlan(phaseDir: string, body: string): Promise<void> {
  writeFileSync(join(phaseDir, "PLAN.md"), body.endsWith("\n") ? body : `${body}\n`);
}

export async function writeExecution(phaseDir: string, entry: string): Promise<void> {
  const stamped = `## ${new Date().toISOString()}\n\n${entry}\n\n`;
  appendFileSync(join(phaseDir, "EXECUTION.md"), stamped);
}

export async function writeVerification(
  phaseDir: string,
  verification: PhaseVerification,
): Promise<void> {
  const validated = PhaseVerificationSchema.parse(verification);
  writeFileSync(
    join(phaseDir, "verification.json"),
    JSON.stringify(validated, null, 2) + "\n",
  );
  if (!validated.passed) return;
  writeFileSync(
    join(phaseDir, "VERIFICATION.md"),
    renderVerificationMd(validated),
  );
}

export async function readVerification(phaseDir: string): Promise<PhaseVerification | null> {
  const path = join(phaseDir, "verification.json");
  if (!existsSync(path)) return null;
  const data = JSON.parse(readFileSync(path, "utf8"));
  return PhaseVerificationSchema.parse(data);
}

function renderVerificationMd(v: PhaseVerification): string {
  const lines = [
    `# Verification — ${v.phase}`,
    "",
    `**Status:** ${v.passed ? "✅ passed" : "❌ failed"}`,
    `**Checked at:** ${v.checkedAt}`,
    "",
    "## Criteria",
    "",
  ];
  for (const c of v.criteria) {
    lines.push(`- ${c.passed ? "✅" : "❌"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
  }
  if (v.notes) {
    lines.push("", "## Notes", "", v.notes);
  }
  lines.push("");
  return lines.join("\n");
}
