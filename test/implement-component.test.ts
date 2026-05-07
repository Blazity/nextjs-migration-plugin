import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { implementComponent } from "../lib/implement-component.ts";
import { migrationPaths } from "../lib/migration-paths.ts";
import type { ApprovedInventoryEntry } from "../schemas/approved-inventory.ts";
import type { RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";

const now = "2026-05-07T12:00:00.000Z";

describe("implementComponent", () => {
  it("writes an approved component and Storybook stories without ID-derived symbols", () => {
    const targetDir = mkdtempSync(join(tmpdir(), "implement-component-"));
    mkdirSync(join(targetDir, "src/components"), { recursive: true });
    writeJson(migrationPaths(targetDir).rawDiscovery, rawDiscovery());
    writeFile(
      join(targetDir, ".migration/pages/home/generated/01-hero.generated.jsx"),
      '<section className="hero"><h1>Homepage Hero</h1></section>',
    );
    writeFile(
      join(targetDir, ".migration/pages/about/generated/01-hero.generated.jsx"),
      '<section className="hero"><h1>About Hero</h1></section>',
    );

    const result = implementComponent({
      targetDir,
      entry: approvedEntry(),
    });

    expect(result).toEqual({
      componentPath: join(targetDir, "src/components/Hero.tsx"),
      storyPath: join(targetDir, "src/components/Hero.stories.tsx"),
      sectionInstanceIds: ["p0-s0", "p1-s0"],
    });
    expect(readFileSync(result.componentPath, "utf8")).toMatchInlineSnapshot(`
      "export default function Hero() {
        return (
          <>
            <section className="hero"><h1>Homepage Hero</h1></section>
          </>
        );
      }
      "
    `);

    const story = readFileSync(result.storyPath, "utf8");
    expect(story).toMatchInlineSnapshot(`
      "import type { Meta, StoryObj } from "@storybook/react";
      import HeroComponent from "./Hero";

      const meta = {
        title: "Migrated Components/Hero",
        component: HeroComponent,
      } satisfies Meta<typeof HeroComponent>;

      export default meta;
      type Story = StoryObj<typeof meta>;

      // Section instance: p0-s0
      export const Hero: Story = {};

      // Section instance: p1-s0
      export const HeroVariant2: Story = {};
      "
    `);
    const exportedStoryNames = [...story.matchAll(/export const ([A-Za-z0-9_]+)/g)]
      .map(match => match[1]);
    expect(exportedStoryNames).toEqual(["Hero", "HeroVariant2"]);
    expect(exportedStoryNames.join(" ")).not.toMatch(/p\d+s\d+|p\d+-s\d+/i);
  });
});

function approvedEntry(): ApprovedInventoryEntry {
  return {
    componentGroupId: "group-hero",
    proposedName: "Hero",
    kind: "content",
    sectionInstanceIds: ["p0-s0", "p1-s0"],
    implementationName: "Hero",
    filePath: "src/components/Hero.tsx",
  };
}

function rawDiscovery(): RawDiscoveryEvidence {
  return {
    probedAt: now,
    pages: [
      {
        url: "https://example.com/",
        sections: [
          {
            id: "p0-s0",
            selector: "main > section",
            tagSkeleton: "section>h1",
            pathShingles: [],
            sampleText: "Homepage Hero",
            boundingBox: { x: 0, y: 0, width: 1440, height: 500 },
          },
        ],
      },
      {
        url: "https://example.com/about",
        sections: [
          {
            id: "p1-s0",
            selector: "main > section",
            tagSkeleton: "section>h1",
            pathShingles: [],
            sampleText: "About Hero",
            boundingBox: { x: 0, y: 0, width: 1440, height: 500 },
          },
        ],
      },
    ],
    referenceScreenshots: {
      components: [],
      pages: [
        {
          slug: "home",
          url: "https://example.com/",
          viewport: 1440,
          path: ".migration/references/pages/home-1440.png",
          sha256: "abcdefabcdef1234",
        },
        {
          slug: "about",
          url: "https://example.com/about",
          viewport: 1440,
          path: ".migration/references/pages/about-1440.png",
          sha256: "1234567890abcdef",
        },
      ],
    },
    source: {
      sourceUrl: "https://example.com/",
      capturedAt: now,
    },
  };
}

function writeJson(path: string, value: unknown): void {
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFile(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}
