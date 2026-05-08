import type { DraftInventory } from "../schemas/draft-inventory.ts";
import type { RawDiscoveryEvidence } from "../schemas/raw-discovery.ts";

const VIEWPORTS = [390, 768, 1440] as const;
const DEFAULT_SAMPLE_LIMIT = 3;

export interface RenderInventoryReviewHtmlArgs {
  draftInventory: DraftInventory;
  evidence: RawDiscoveryEvidence;
  sampleLimit?: number;
}

export function renderInventoryReviewHtml(args: RenderInventoryReviewHtmlArgs): string {
  const sampleLimit = args.sampleLimit ?? DEFAULT_SAMPLE_LIMIT;
  const sectionLookup = buildSectionLookup(args.evidence);
  const referencesBySection = buildReferenceLookup(args.evidence);
  const blockingNames = args.draftInventory.entries.filter(entry => isGenericOrIdLike(entry.proposedName));

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Component Inventory Review</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; color: #1f2937; background: #f8fafc; }
    .banner { padding: 12px 16px; margin-bottom: 12px; border: 1px solid #cbd5e1; background: #ffffff; }
    .warning { border-color: #f59e0b; background: #fffbeb; }
    .group { margin: 24px 0; padding: 16px; border: 1px solid #cbd5e1; background: #ffffff; }
    .instance { margin-top: 16px; }
    .instance[data-hidden="true"] { display: none; }
    img { max-width: 100%; height: auto; display: block; border: 1px solid #e2e8f0; }
    button { margin-right: 8px; }
    button[data-copy] { font-size: 12px; margin-left: 8px; opacity: 0.65; }
    button[data-copy]:hover { opacity: 1; }
  </style>
</head>
<body>
  <h1>Component Inventory Review</h1>
  <div class="banner">Read-only &mdash; request changes in chat</div>
  ${blockingNames.length > 0 ? `<div class="banner warning">Approval blocked: ${blockingNames.length} components have generic or ID-like names</div>` : ""}
  ${args.draftInventory.entries.map(entry => {
    const hiddenCount = Math.max(0, entry.sectionInstanceIds.length - sampleLimit);
    return `<section class="group" data-component-group-id="${escapeAttr(entry.componentGroupId)}">
      <h2>${escapeHtml(entry.proposedName)}${copyButton(entry.proposedName, "Copy component name")}${copyButton(entry.componentGroupId, "Copy group id")}</h2>
      <p>Kind: ${escapeHtml(entry.kind)}</p>
      <div class="viewports">
        ${VIEWPORTS.map(viewport => `<button type="button" data-viewport="${viewport}">${viewport}</button>`).join("")}
      </div>
      ${entry.sectionInstanceIds.map((sectionInstanceId, index) => {
        const section = sectionLookup.get(sectionInstanceId);
        const refs = referencesBySection.get(sectionInstanceId) ?? new Map();
        const initialSrc = relativeReferencePath(refs.get(390)?.path);
        return `<article class="instance" data-section-instance-id="${escapeAttr(sectionInstanceId)}"${index >= sampleLimit ? ' data-hidden="true"' : ""}>
          <h3>${escapeHtml(sectionInstanceId)}${copyButton(sectionInstanceId, "Copy section id")}</h3>
          <p><a href="${escapeAttr(section?.url ?? "")}">${escapeHtml(section?.url ?? "Unknown source")}</a></p>
          <img alt="${escapeAttr(`${entry.proposedName} ${sectionInstanceId}`)}" src="${escapeAttr(initialSrc)}"${VIEWPORTS.map(viewport => ` data-src-${viewport}="${escapeAttr(relativeReferencePath(refs.get(viewport)?.path))}"`).join("")}>
        </article>`;
      }).join("")}
      ${hiddenCount > 0 ? `<button type="button" data-action="reveal">Reveal hidden (${hiddenCount})</button>` : ""}
    </section>`;
  }).join("")}
  <script>
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const copyValue = target.dataset.copy;
      if (copyValue) {
        const done = () => {
          const original = target.textContent || "Copy";
          target.textContent = "Copied";
          setTimeout(() => { target.textContent = original; }, 900);
        };
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(copyValue).then(done).catch(() => fallbackCopy(copyValue, done));
        } else {
          fallbackCopy(copyValue, done);
        }
        return;
      }
      const viewport = target.dataset.viewport;
      if (viewport) {
        document.querySelectorAll("img[data-src-" + viewport + "]").forEach((img) => {
          img.setAttribute("src", img.getAttribute("data-src-" + viewport) || "");
        });
      }
      if (target.dataset.action === "reveal") {
        target.closest(".group")?.querySelectorAll('[data-hidden="true"]').forEach((node) => {
          node.removeAttribute("data-hidden");
        });
        target.remove();
      }
    });
    function fallbackCopy(value, done) {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      done();
    }
  </script>
</body>
</html>
`;
}

function buildSectionLookup(evidence: RawDiscoveryEvidence): Map<string, { url: string }> {
  const lookup = new Map<string, { url: string }>();
  evidence.pages.forEach((page, pageIndex) => {
    page.sections.forEach((section, sectionIndex) => {
      lookup.set(section.id, { url: page.url });
      lookup.set(`p${pageIndex}-s${sectionIndex}`, { url: page.url });
    });
  });
  return lookup;
}

function buildReferenceLookup(
  evidence: RawDiscoveryEvidence,
): Map<string, Map<390 | 768 | 1440, RawDiscoveryEvidence["referenceScreenshots"]["components"][number]>> {
  const lookup = new Map<string, Map<390 | 768 | 1440, RawDiscoveryEvidence["referenceScreenshots"]["components"][number]>>();
  for (const reference of evidence.referenceScreenshots.components) {
    const byViewport = lookup.get(reference.sectionInstanceId) ?? new Map();
    byViewport.set(reference.viewport, reference);
    lookup.set(reference.sectionInstanceId, byViewport);
  }
  return lookup;
}

function relativeReferencePath(path: string | undefined): string {
  return path ? `../${path}` : "";
}

function isGenericOrIdLike(name: string): boolean {
  return /^Component\d+$/.test(name) || /^Section\d+$/.test(name) || /^UnnamedGroup\d+$/.test(name) || /^P\d+S\d+$/.test(name) || /p\d+-s\d+/.test(name);
}

function copyButton(value: string, label: string): string {
  return `<button type="button" data-copy="${escapeAttr(value)}" aria-label="${escapeAttr(label)}">Copy</button>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
