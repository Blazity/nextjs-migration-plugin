import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { join, relative } from "node:path";

export interface CopyAssetsArgs {
  pagesDir: string;
  slugs: string[];
  targetDir: string;
}

export interface CopyAssetsResult {
  copied: { from: string; to: string }[];
}

function walk(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

export function copyStagedAssets(args: CopyAssetsArgs): CopyAssetsResult {
  const copied: { from: string; to: string }[] = [];
  for (const slug of args.slugs) {
    const stagingRoot = join(args.pagesDir, slug, "_staging/public");
    if (!existsSync(stagingRoot)) continue;
    for (const src of walk(stagingRoot)) {
      const rel = relative(stagingRoot, src);
      const dst = join(args.targetDir, "public", rel);
      mkdirSync(join(dst, ".."), { recursive: true });
      copyFileSync(src, dst);
      copied.push({ from: src, to: dst });
    }
  }
  return { copied };
}
