import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

interface Args {
  sourceUrl: string;
  outputPath: string;
  maxPages: number;
  maxDepth: number;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const sourceUrl = get("--source-url");
  const outputPath = get("--output");
  const maxPages = Number(get("--max-pages") ?? "50");
  const maxDepth = Number(get("--max-depth") ?? "3");
  if (!sourceUrl || !outputPath) {
    throw new Error("Usage: crawl-site --source-url <url> --output <path> [--max-pages N] [--max-depth N]");
  }
  return { sourceUrl, outputPath, maxPages, maxDepth };
}

function urlToSlug(url: string): string {
  const u = new URL(url);
  // Mirror lib/slug.ts: decode percent-encoded pathname before stripping
  // non-url-safe chars, otherwise `%20` survives as `20` in the slug.
  let decoded: string;
  try { decoded = decodeURIComponent(u.pathname); } catch { decoded = u.pathname; }
  const normalized = decoded.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const p = normalized.replace(/^\/+|\/+$/g, "");
  if (!p) return "home";
  const slug = p.toLowerCase().replace(/[^a-z0-9/]+/g, "-").replace(/\/+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return slug === "" ? "page" : slug;
}

async function fetchRobots(origin: string): Promise<{ fetched: boolean; disallowedPaths: string[] }> {
  try {
    const res = await fetch(new URL("/robots.txt", origin));
    if (!res.ok) return { fetched: false, disallowedPaths: [] };
    const text = await res.text();
    const disallowed: string[] = [];
    let appliesToAll = false;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const [k, ...rest] = line.split(":");
      const v = rest.join(":").trim();
      if (k.toLowerCase() === "user-agent") appliesToAll = v === "*";
      else if (appliesToAll && k.toLowerCase() === "disallow" && v) disallowed.push(v);
    }
    return { fetched: true, disallowedPaths: disallowed };
  } catch {
    return { fetched: false, disallowedPaths: [] };
  }
}

function isAllowed(path: string, disallowed: string[]): boolean {
  return !disallowed.some(prefix => path.startsWith(prefix));
}

function normalize(url: string): string {
  const u = new URL(url);
  u.hash = "";
  u.search = "";
  if (u.pathname.endsWith("/") && u.pathname.length > 1) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }
  return u.href;
}

// Conservative same-registrable-host check: accepts only apex ↔ `www.` variants
// of the same domain so that a 307 from `example.com` → `www.example.com`
// (or vice versa) does not get rejected by the same-origin filter, while
// cross-site redirects (to a third-party CDN, login portal, etc.) still are.
function sameRegistrableHost(a: string, b: string): boolean {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al === bl) return true;
  const stripWww = (h: string) => h.replace(/^www\./, "");
  return stripWww(al) === stripWww(bl);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const seed = new URL(args.sourceUrl);
  let origin = seed.origin;
  let canonicalSeedHref = seed.href;

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Pre-resolve the seed: follow any host-normalization redirect (apex → www
  // or www → apex) so the same-origin filter below does not silently drop
  // every page. Cross-site redirects (e.g., apex 307 → cdn.example.net) are
  // not accepted; we only canonicalize within the same registrable host.
  try {
    await page.goto(seed.href, { waitUntil: "domcontentloaded", timeout: 15_000 });
    const finalUrl = new URL(page.url());
    if (finalUrl.origin !== origin && sameRegistrableHost(seed.hostname, finalUrl.hostname)) {
      origin = finalUrl.origin;
      canonicalSeedHref = finalUrl.href;
    }
  } catch {
    // Seed pre-fetch failed; the main crawl loop below will surface any error.
  }

  const robots = await fetchRobots(origin);

  interface Visited {
    url: string;
    depth: number;
    discoveredVia: "seed" | "sitemap" | "link";
    title: string;
    status: number;
    outboundLinks: string[];
  }
  const visited = new Map<string, Visited>();
  const errors: { url: string; reason: string }[] = [];
  const queue: { url: string; depth: number; via: Visited["discoveredVia"] }[] = [
    { url: canonicalSeedHref, depth: 0, via: "seed" },
  ];

  while (queue.length > 0 && visited.size < args.maxPages) {
    const next = queue.shift()!;
    const norm = normalize(next.url);
    if (visited.has(norm)) continue;
    if (next.depth > args.maxDepth) continue;
    const u = new URL(norm);
    if (u.origin !== origin) continue;
    if (!isAllowed(u.pathname, robots.disallowedPaths)) continue;

    try {
      const resp = await page.goto(norm, { waitUntil: "domcontentloaded", timeout: 15_000 });
      const status = resp?.status() ?? 0;
      // Resolve to the post-redirect canonical URL. Without this, a single
      // logical page that the site exposes via several paths (e.g.
      // /case-study/X redirected to /case-studies/X, or trailing-slash
      // variants the server canonicalizes) ends up duplicated in crawl.json
      // and downstream produces conflicting library entries plus duplicate
      // spec hashes in Phase 4. See knowledge/open-issues/002.
      const finalNorm = normalize(page.url());
      if (visited.has(finalNorm)) continue;
      const fu = new URL(finalNorm);
      if (fu.origin !== origin) continue;
      if (!isAllowed(fu.pathname, robots.disallowedPaths)) continue;

      const title = await page.title();
      const links = await page.$$eval("a[href]", as =>
        (as as HTMLAnchorElement[]).map(a => a.href).filter(h => h.startsWith("http")),
      );
      visited.set(finalNorm, {
        url: finalNorm, depth: next.depth, discoveredVia: next.via,
        title, status, outboundLinks: links,
      });
      for (const l of links) {
        const ln = normalize(l);
        if (!visited.has(ln) && new URL(ln).origin === origin) {
          queue.push({ url: ln, depth: next.depth + 1, via: "link" });
        }
      }
    } catch (err) {
      errors.push({ url: norm, reason: (err as Error).message });
    }
  }

  await browser.close();

  const crawl = {
    sourceUrl: canonicalSeedHref,
    requestedSourceUrl: args.sourceUrl,
    crawledAt: new Date().toISOString(),
    limits: { maxPages: args.maxPages, maxDepth: args.maxDepth },
    robotsTxt: robots,
    sitemapUrls: [],
    pages: [...visited.values()].map(v => ({ ...v, slug: urlToSlug(v.url) })),
    errors,
  };

  mkdirSync(dirname(args.outputPath), { recursive: true });
  writeFileSync(args.outputPath, JSON.stringify(crawl, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
