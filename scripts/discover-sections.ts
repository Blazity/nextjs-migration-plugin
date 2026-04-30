import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

interface Args {
  urls: string[];
  primarySelector: string;
  outputPath: string;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const urlsArg = get("--urls");
  const primarySelector = get("--selector");
  const outputPath = get("--output");
  if (!urlsArg || !primarySelector || !outputPath) {
    throw new Error(
      "Usage: discover-sections --urls <url1,url2,...> --selector <css> --output <path>",
    );
  }
  return { urls: urlsArg.split(","), primarySelector, outputPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const pages = [];
  for (let pIdx = 0; pIdx < args.urls.length; pIdx++) {
    const url = args.urls[pIdx];
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
      // NOTE: tsx/esbuild rewrites named function declarations and named
      // arrow-fn-assigned consts to call `__name(fn, "name")` for stack-trace
      // friendliness. That helper exists in the host module but not in the
      // page evaluation context, so any named function inside a Playwright
      // `$$eval` callback would throw `ReferenceError: __name is not defined`.
      // We shim it inline at the top of the page-side body.
      const sections = await page.$$eval(args.primarySelector, (els, selector: string) => {
        // Shim: idempotent no-op equivalent of esbuild's keepNames helper.
        // `globalThis as any` keeps this valid TS without a separate decl.
        if (typeof (globalThis as { __name?: unknown }).__name !== "function") {
          (globalThis as { __name: (fn: unknown) => unknown }).__name = (fn) => fn;
        }
        const tagPath = (el: Element): string[] => {
          const path: string[] = [];
          let cur: Element | null = el;
          while (cur && cur.tagName !== "HTML") {
            path.unshift(cur.tagName.toLowerCase());
            cur = cur.parentElement;
          }
          return path;
        };
        const tagSkeleton = (el: Element, depth = 0): string => {
          if (depth > 4) return el.tagName.toLowerCase();
          const children = Array.from(el.children)
            .map((c) => tagSkeleton(c, depth + 1))
            .filter(Boolean);
          const tag = el.tagName.toLowerCase();
          return children.length > 0 ? `${tag}>${children.join(",")}` : tag;
        };
        const pathShinglesOf = (tags: string[], n = 3): string[] => {
          if (tags.length === 0) return [];
          if (tags.length < n) return [tags.join(">")];
          const out: string[] = [];
          for (let i = 0; i + n <= tags.length; i++) {
            out.push(tags.slice(i, i + n).join(">"));
          }
          return out;
        };
        return (els as Element[]).map((el, sIdx) => {
          const rect = el.getBoundingClientRect();
          const tags = tagPath(el);
          return {
            sIdx,
            selector,
            tagSkeleton: tagSkeleton(el),
            pathShingles: pathShinglesOf(tags),
            sampleText: (el as HTMLElement).innerText.replace(/\s+/g, " ").trim().slice(0, 200),
            boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          };
        });
      }, args.primarySelector);

      pages.push({
        url,
        sections: sections.map(s => ({
          id: `p${pIdx}-s${s.sIdx}`,
          selector: s.selector,
          tagSkeleton: s.tagSkeleton,
          pathShingles: s.pathShingles,
          sampleText: s.sampleText,
          boundingBox: s.boundingBox,
        })),
      });
    } catch (err) {
      pages.push({ url, sections: [] });
    }
  }

  await browser.close();

  const out = { probedAt: new Date().toISOString(), pages };
  mkdirSync(dirname(args.outputPath), { recursive: true });
  writeFileSync(args.outputPath, JSON.stringify(out, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
