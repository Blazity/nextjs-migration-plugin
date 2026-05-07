import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateJsx } from "../scripts/generate-jsx.ts";

describe("generateJsx", () => {
  it("rejects image structures when no image manifest exists", () => {
    const root = mkdtempSync(join(tmpdir(), "generate-jsx-"));
    const specsDir = join(root, "spec");
    const outputDir = join(root, "generated");
    mkdirSync(specsDir, { recursive: true });
    writeFileSync(
      join(specsDir, "01-hero.structure.md"),
      '# Hero\n\n## Element Tree\n\n- section\n  - img [src="https://cdn.example.com/logo.png"] [alt="Logo"] (20x10)\n',
    );

    expect(() => generateJsx({ specsDir, outputDir })).toThrow(/Missing image manifest/);
  });

  it("uses image-manifest local paths instead of homepage fallback paths", () => {
    const root = mkdtempSync(join(tmpdir(), "generate-jsx-"));
    const specsDir = join(root, "spec");
    const outputDir = join(root, "generated");
    mkdirSync(specsDir, { recursive: true });
    writeFileSync(
      join(specsDir, "01-hero.structure.md"),
      '# Hero\n\n## Element Tree\n\n- section\n  - img [src="https://cdn.example.com/logo.png"] [alt="Logo"] (20x10)\n',
    );
    writeFileSync(join(specsDir, "image-manifest.json"), JSON.stringify({
      url: "https://example.com/",
      totalImages: 1,
      sections: [{
        index: 0,
        label: "01-hero",
        images: [{
          originalUrl: "https://cdn.example.com/logo.png",
          localPath: "images/example.com/page/01-hero/logo-a1b2c3d4.png",
          alt: "Logo",
        }],
        inlineSvgs: [],
      }],
    }));

    generateJsx({ specsDir, outputDir });

    const generated = readFileSync(join(outputDir, "01-hero.generated.jsx"), "utf8");
    expect(generated).toContain('src="/images/example.com/page/01-hero/logo-a1b2c3d4.png"');
    expect(generated).not.toContain("/images/homepage/");
  });
});
