import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyStagedAssets } from "../lib/asset-copier.ts";

describe("copyStagedAssets", () => {
  it("flat-copies binaries from pages/<slug>/_staging/public/images/<domain>/<page>/* to <target>/public/images/<domain>/<page>/*", () => {
    const root = mkdtempSync(join(tmpdir(), "assets-"));
    const stagingRoot = join(root, ".migration/pages/home/_staging/public/images/example.com/home/01-hero");
    mkdirSync(stagingRoot, { recursive: true });
    writeFileSync(join(stagingRoot, "logo-abc.png"), "PNG-BYTES");
    const targetDir = join(root, "target");
    mkdirSync(targetDir, { recursive: true });

    const result = copyStagedAssets({
      pagesDir: join(root, ".migration/pages"),
      slugs: ["home"],
      targetDir,
    });

    expect(result.copied).toHaveLength(1);
    expect(existsSync(join(targetDir, "public/images/example.com/home/01-hero/logo-abc.png"))).toBe(true);
    expect(readFileSync(join(targetDir, "public/images/example.com/home/01-hero/logo-abc.png"), "utf8")).toBe("PNG-BYTES");
  });

  it("returns an empty list when there are no staged binaries", () => {
    const root = mkdtempSync(join(tmpdir(), "assets-"));
    mkdirSync(join(root, ".migration/pages/home"), { recursive: true });
    const targetDir = join(root, "target");
    mkdirSync(targetDir, { recursive: true });
    const result = copyStagedAssets({
      pagesDir: join(root, ".migration/pages"),
      slugs: ["home"],
      targetDir,
    });
    expect(result.copied).toEqual([]);
  });
});
