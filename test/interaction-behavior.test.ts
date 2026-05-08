import { describe, expect, it } from "vitest";
import {
  classifyInteractionBehavior,
  verifyInteractionBehavior,
} from "../lib/interaction-behavior.ts";
import { InteractionBehaviorSchema, InteractionClassSchema } from "../schemas/interaction-behavior.ts";
import type { ApprovedInventoryEntry } from "../schemas/approved-inventory.ts";
import type { RawDiscoveryEvidence, ComponentReference } from "../schemas/raw-discovery.ts";

const now = "2026-05-08T12:00:00.000Z";

describe("interaction behavior", () => {
  it("accepts the five interaction classes and rejects unknown classes", () => {
    for (const value of ["static", "css-state", "client-state", "form-integration", "motion"]) {
      expect(InteractionClassSchema.safeParse(value).success).toBe(true);
    }
    expect(InteractionClassSchema.safeParse("interactive").success).toBe(false);
  });

  it("classifies plain content as static", () => {
    expect(classify("section>h1+p", "Hero copy").class).toBe("static");
  });

  it("classifies hover or focus evidence as css-state", () => {
    expect(classify("section>a", "Primary CTA", { generatedSource: '<a className="hover:bg-blue-500 focus:ring">Start</a>' }).class)
      .toBe("css-state");
  });

  it("classifies menus, tabs, accordions, and carousels as client-state", () => {
    expect(classify("nav>button+ul", "Menu Products Resources").class).toBe("client-state");
    expect(classify("section>button+div", "Accordion FAQ").class).toBe("client-state");
    expect(classify("section>div", "Carousel next previous").class).toBe("client-state");
  });

  it("classifies form evidence as form-integration", () => {
    expect(classify("section>form>input+button", "Contact us").class).toBe("form-integration");
  });

  it("classifies animation and autoplay evidence as motion", () => {
    expect(classify("section>video", "Autoplay demo").class).toBe("motion");
    expect(classify("section>div", "Logo marquee").class).toBe("motion");
  });

  it("marks required client behavior unresolved until checks are verified", () => {
    const behavior = classify("nav>button+ul", "Menu");

    expect(verifyInteractionBehavior(behavior)).toMatchObject({
      status: "unresolved",
      unresolvedBehavior: ["verify open and closed state"],
    });
    expect(verifyInteractionBehavior(behavior, {
      verifiedChecks: ["verify open and closed state"],
    })).toMatchObject({
      status: "verified",
      unresolvedBehavior: [],
    });
  });

  it("validates serialized behavior records", () => {
    expect(() =>
      InteractionBehaviorSchema.parse({
        class: "css-state",
        status: "not-required",
        evidence: ["hover class"],
        requiredChecks: ["capture hover/focus state"],
        verifiedChecks: [],
        unresolvedBehavior: [],
      }),
    ).not.toThrow();
  });
});

function classify(
  tagSkeleton: string,
  sampleText: string,
  options: { generatedSource?: string } = {},
) {
  return classifyInteractionBehavior({
    entry: approvedEntry(),
    evidence: rawDiscovery({
      tagSkeleton,
      sampleText,
    }),
    generatedSources: options.generatedSource
      ? new Map([["p0-s0", options.generatedSource]])
      : new Map(),
  });
}

function approvedEntry(): ApprovedInventoryEntry {
  return {
    componentGroupId: "group",
    proposedName: "Example",
    kind: "content",
    sectionInstanceIds: ["p0-s0"],
    implementationName: "Example",
    filePath: "src/components/Example.tsx",
  };
}

function rawDiscovery(args: {
  tagSkeleton: string;
  sampleText: string;
}): RawDiscoveryEvidence {
  const componentReference: ComponentReference = {
    sectionInstanceId: "p0-s0",
    url: "https://example.com/",
    viewport: 1440,
    path: ".migration/references/components/p0-s0-1440.png",
    sha256: "abcdefabcdef1234",
  };
  return {
    probedAt: now,
    pages: [
      {
        url: "https://example.com/",
        sections: [
          {
            id: "p0-s0",
            selector: "main > section",
            tagSkeleton: args.tagSkeleton,
            pathShingles: [],
            sampleText: args.sampleText,
            boundingBox: { x: 0, y: 0, width: 1440, height: 500 },
          },
        ],
      },
    ],
    referenceScreenshots: {
      components: [componentReference],
      pages: [],
    },
    source: {
      sourceUrl: "https://example.com/",
      capturedAt: now,
    },
  };
}
