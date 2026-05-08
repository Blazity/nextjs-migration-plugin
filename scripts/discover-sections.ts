import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

interface Args {
  urls: string[];
  primarySelector: string;
  skipSelectors: string[];
  outputPath: string;
}

const ROOT_WRAPPER_SECTION_SELECTOR = [
  "body > :not(header):not(nav):not(main):not(section):not(article):not(aside):not(footer):not(script):not(style):not(noscript) > header",
  "body > :not(header):not(nav):not(main):not(section):not(article):not(aside):not(footer):not(script):not(style):not(noscript) > nav",
  "body > :not(header):not(nav):not(main):not(section):not(article):not(aside):not(footer):not(script):not(style):not(noscript) > main > *",
  "body > :not(header):not(nav):not(main):not(section):not(article):not(aside):not(footer):not(script):not(style):not(noscript) > section",
  "body > :not(header):not(nav):not(main):not(section):not(article):not(aside):not(footer):not(script):not(style):not(noscript) > article",
  "body > :not(header):not(nav):not(main):not(section):not(article):not(aside):not(footer):not(script):not(style):not(noscript) > aside",
  "body > :not(header):not(nav):not(main):not(section):not(article):not(aside):not(footer):not(script):not(style):not(noscript) > footer",
].join(", ");

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const urlsArg = get("--urls");
  const primarySelector = get("--selector");
  const skipArg = get("--skip-selectors");
  const outputPath = get("--output");
  if (!urlsArg || !primarySelector || !outputPath) {
    throw new Error(
      "Usage: discover-sections --urls <url1,url2,...> --selector <css> [--skip-selectors <css1,css2>] --output <path>",
    );
  }
  return {
    urls: urlsArg.split(","),
    primarySelector,
    skipSelectors: skipArg ? skipArg.split(",").map(s => s.trim()).filter(Boolean) : [],
    outputPath,
  };
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
      const primaryCount = await page.locator(args.primarySelector).count().catch(() => 0);
      const wrapperCount = await page.locator(ROOT_WRAPPER_SECTION_SELECTOR).count().catch(() => 0);
      const effectiveSelector = primaryCount > 0 && wrapperCount > 0
        ? `${args.primarySelector}, ${ROOT_WRAPPER_SECTION_SELECTOR}`
        : primaryCount > 0
          ? args.primarySelector
          : ROOT_WRAPPER_SECTION_SELECTOR;
      // NOTE: tsx/esbuild rewrites named function declarations and named
      // arrow-fn-assigned consts to call `__name(fn, "name")` for stack-trace
      // friendliness. That helper exists in the host module but not in the
      // page evaluation context, so any named function inside a Playwright
      // `$$eval` callback would throw `ReferenceError: __name is not defined`.
      // We shim it inline at the top of the page-side body.
      const sections = await page.$$eval(effectiveSelector, (els, payload: { selector: string; skip: string[] }) => {
        // Shim: idempotent no-op equivalent of esbuild's keepNames helper.
        // `globalThis as any` keeps this valid TS without a separate decl.
        if (typeof (globalThis as { __name?: unknown }).__name !== "function") {
          (globalThis as { __name: (fn: unknown) => unknown }).__name = (fn) => fn;
        }
        const matchesSkip = (el: Element): boolean => {
          for (const sel of payload.skip) {
            try { if (el.matches(sel)) return true; } catch { /* invalid selector → ignore */ }
          }
          return false;
        };
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
          if (depth >= 8) return el.tagName.toLowerCase();
          const children = Array.from(el.children)
            .filter((child) => !["script", "style", "noscript", "link"].includes(child.tagName.toLowerCase()))
            .map((c) => tagSkeleton(c, depth + 1))
            .filter(Boolean);
          const tag = el.tagName.toLowerCase();
          return children.length > 0 ? `${tag}>${children.join(",")}` : tag;
        };
        const bucket = (count: number, buckets: Array<[number, string]>, fallback: string): string => {
          for (const [max, label] of buckets) {
            if (count <= max) return label;
          }
          return fallback;
        };
        const signalsOf = (el: Element, rect: DOMRect) => {
          const textLength = ((el as HTMLElement).innerText || "").replace(/\s+/g, " ").trim().length;
          return {
            imgCount: bucket(el.querySelectorAll("img").length, [[0, "0"], [1, "1"], [4, "2-4"]], "5+"),
            videoCount: el.querySelectorAll("video").length > 0 ? "1+" : "0",
            formCount: el.querySelectorAll("form").length > 0 ? "1+" : "0",
            buttonCount: bucket(el.querySelectorAll("button, a[role='button'], input[type='button'], input[type='submit']").length, [[0, "0"], [1, "1"], [2, "2"]], "3+"),
            headingCount: bucket(el.querySelectorAll("h1, h2, h3, h4, h5, h6").length, [[0, "0"], [1, "1"], [3, "2-3"]], "4+"),
            liCount: bucket(el.querySelectorAll("li").length, [[0, "0"], [3, "1-3"], [10, "4-10"]], "11+"),
            textLen: bucket(textLength, [[49, "<50"], [199, "<200"], [499, "<500"]], "500+"),
            height: bucket(rect.height, [[399, "<400"], [799, "<800"], [1499, "<1500"]], "1500+"),
          };
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
        return (els as Element[])
          .filter((el) => !matchesSkip(el))
          .map((el, sIdx) => {
            const rect = el.getBoundingClientRect();
            const tags = tagPath(el);
            return {
              sIdx,
              selector: payload.selector,
              tagSkeleton: tagSkeleton(el),
              pathShingles: pathShinglesOf(tags),
              sampleText: (el as HTMLElement).innerText.replace(/\s+/g, " ").trim().slice(0, 200),
              boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              signals: signalsOf(el, rect),
            };
          });
      }, { selector: effectiveSelector, skip: args.skipSelectors });

      pages.push({
        url,
        sections: sections.map(s => ({
          id: `p${pIdx}-s${s.sIdx}`,
          selector: s.selector,
          tagSkeleton: s.tagSkeleton,
          pathShingles: s.pathShingles,
          sampleText: s.sampleText,
          boundingBox: s.boundingBox,
          signals: s.signals,
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
