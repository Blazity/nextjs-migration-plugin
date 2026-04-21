// gray-matter's default js-yaml dumper wraps strings containing ":" in single
// quotes (e.g. `sourceUrl: 'https://example.com'`), which breaks the plain
// `sourceUrl: https://example.com` format asserted by loader/status/config
// tests. Serialize plain-scalar YAML ourselves for SITE.md.
export function stringifyFrontmatter(data: Record<string, unknown>, body: string): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    lines.push(`${key}: ${value}`);
  }
  lines.push("---", "", body.endsWith("\n") ? body : `${body}\n`);
  return lines.join("\n");
}
