import type { ApprovedInventoryEntry } from "../schemas/approved-inventory.ts";
import type { InteractionBehavior, InteractionClass } from "../schemas/interaction-behavior.ts";
import type { RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";
import type { SectionRecord } from "../schemas/sections.ts";

export interface ClassifyInteractionBehaviorArgs {
  entry: ApprovedInventoryEntry;
  evidence: RawDiscoveryEvidence;
  generatedSources?: Map<string, string>;
}

export interface VerifyInteractionBehaviorArgs {
  verifiedChecks?: string[];
}

export function classifyInteractionBehavior(
  args: ClassifyInteractionBehaviorArgs,
): InteractionBehavior {
  const sources = sectionSources(args);
  const sourceText = sources.map(source => source.text).join(" ");
  const evidence: string[] = [];
  const addEvidence = (label: string) => {
    if (!evidence.includes(label)) evidence.push(label);
  };
  const has = (pattern: RegExp): boolean => pattern.test(sourceText);

  let interactionClass: InteractionClass = "static";
  if (has(/\b(form|input|textarea|select)\b/i) || sources.some(source => source.section.signals?.formCount === "1+")) {
    interactionClass = "form-integration";
    addEvidence("form controls detected");
  } else if (has(/\b(marquee|autoplay|animation|animate|ix2|video|motion)\b/i) || sources.some(source => source.section.signals?.videoCount === "1+")) {
    interactionClass = "motion";
    addEvidence("motion or autoplay evidence detected");
  } else if (has(/\b(menu|drawer|dropdown|popover|dialog|modal|carousel|slider|tabs?|accordion|filter|pagination|next|previous)\b/i)) {
    interactionClass = "client-state";
    addEvidence("stateful UI control evidence detected");
  } else if (has(/(?:hover:|focus:|active:|:hover|:focus|aria-pressed|data-state)/i)) {
    interactionClass = "css-state";
    addEvidence("CSS state evidence detected");
  }

  if (evidence.length === 0) {
    addEvidence("no source-observed behavior beyond static content");
  }

  return verifyInteractionBehavior({
    class: interactionClass,
    status: "not-required",
    evidence,
    requiredChecks: requiredChecksFor(interactionClass),
    verifiedChecks: [],
    unresolvedBehavior: [],
  });
}

export function verifyInteractionBehavior(
  behavior: InteractionBehavior,
  args: VerifyInteractionBehaviorArgs = {},
): InteractionBehavior {
  const verifiedChecks = args.verifiedChecks ?? behavior.verifiedChecks;
  const unresolvedBehavior = behavior.requiredChecks.filter(check => !verifiedChecks.includes(check));
  const status = behavior.requiredChecks.length === 0
    ? "not-required"
    : unresolvedBehavior.length === 0
      ? "verified"
      : "unresolved";

  return {
    ...behavior,
    status,
    verifiedChecks,
    unresolvedBehavior,
  };
}

function requiredChecksFor(interactionClass: InteractionClass): string[] {
  switch (interactionClass) {
    case "css-state":
      return ["capture hover/focus state"];
    case "client-state":
      return ["verify open and closed state"];
    case "form-integration":
      return ["verify validation and submission path"];
    case "motion":
      return ["verify motion start and steady state"];
    case "static":
      return [];
  }
}

function sectionSources(args: ClassifyInteractionBehaviorArgs): Array<{
  section: SectionRecord;
  text: string;
}> {
  const sectionsById = new Map<string, SectionRecord>();
  for (const [pageIndex, page] of args.evidence.pages.entries()) {
    for (const [sectionIndex, section] of page.sections.entries()) {
      sectionsById.set(section.id, section);
      sectionsById.set(`p${pageIndex}-s${sectionIndex}`, section);
    }
  }

  return args.entry.sectionInstanceIds.flatMap(sectionInstanceId => {
    const section = sectionsById.get(sectionInstanceId);
    if (!section) return [];
    return [{
      section,
      text: [
        section.selector,
        section.tagSkeleton,
        section.sampleText,
        args.generatedSources?.get(sectionInstanceId) ?? "",
      ].join(" "),
    }];
  });
}
