// gray-matter's default js-yaml dumper wraps strings containing ":" in single
// quotes (e.g. `sourceUrl: 'https://example.com'`), which breaks the plain
// `sourceUrl: https://example.com` format asserted by loader/status/config
// tests. Serialize plain-scalar YAML ourselves for SITE.md.
//
// For nested arrays/objects (e.g. ROADMAP.md's buildOrder, parallelism), we
// emit JSON flow-style — JSON is a strict subset of YAML, so gray-matter's
// js-yaml parser round-trips these correctly without needing a YAML library.
//
// ISO 8601 datetimes are quoted to prevent YAML 1.1 from auto-parsing them
// as JavaScript Date objects (which would then fail `z.string()` validation).
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

export function stringifyFrontmatter(data: Record<string, unknown>, body: string): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (value === null || typeof value !== "object") {
      if (typeof value === "string" && ISO_DATETIME_RE.test(value)) {
        lines.push(`${key}: ${JSON.stringify(value)}`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  lines.push("---", "", body.endsWith("\n") ? body : `${body}\n`);
  return lines.join("\n");
}
