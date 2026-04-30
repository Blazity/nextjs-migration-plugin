export function urlToSlug(url: string): string {
  const parsed = new URL(url);
  // decodeURIComponent: `new URL("https://x/About Us!").pathname` is
  // `/About%20Us!`. Without decoding, `%20` survives the [^a-z0-9/] strip
  // as digits `20`, producing `about-20us` instead of `about-us`.
  let decoded: string;
  try {
    decoded = decodeURIComponent(parsed.pathname);
  } catch {
    // Malformed percent-encoding (e.g. `%XX`) — degrade by feeding the still-
    // encoded pathname to the strip pipeline rather than throwing URIError.
    decoded = parsed.pathname;
  }
  // NFKD + combining-diacritic strip lets non-ASCII paths like `/café`
  // produce `cafe` instead of being wiped to empty by the ASCII filter.
  const normalized = decoded.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const path = normalized.replace(/^\/+|\/+$/g, "");
  if (path === "") return "home";
  const slug = path
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, "-")
    .replace(/\/+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  // Non-ASCII-only paths (e.g. `/中文`) leave nothing behind after the strip.
  // Fall back to a stable placeholder so the `.migration/pages/[slug]/`
  // directory contract never breaks.
  return slug === "" ? "page" : slug;
}
