import assert from "node:assert/strict"
import test from "node:test"

import { deriveShellSummary, inferSvgRoleHint, normalizeStandaloneSvg, resolveImageUrl } from "../lib/extract-images-core.ts"

test("resolveImageUrl prefers currentSrc when src is missing", () => {
  const resolved = resolveImageUrl({
    src: null,
    currentSrc: "https://cdn.example.com/hero.png",
  })

  assert.equal(resolved, "https://cdn.example.com/hero.png")
})

test("resolveImageUrl prefers currentSrc when src is a data placeholder", () => {
  const resolved = resolveImageUrl({
    src: "data:image/png;base64,placeholder",
    currentSrc: "https://cdn.example.com/hero.png",
  })

  assert.equal(resolved, "https://cdn.example.com/hero.png")
})

test("resolveImageUrl falls back to src for normal remote images", () => {
  const resolved = resolveImageUrl({
    src: "https://cdn.example.com/logo.svg",
    currentSrc: "https://cdn.example.com/logo.svg",
  })

  assert.equal(resolved, "https://cdn.example.com/logo.svg")
})

test("resolveImageUrl rejects data-only images with no usable currentSrc", () => {
  const resolved = resolveImageUrl({
    src: "data:image/png;base64,placeholder",
    currentSrc: "data:image/png;base64,placeholder",
  })

  assert.equal(resolved, null)
})

test("inferSvgRoleHint identifies brand logos", () => {
  const role = inferSvgRoleHint({
    alt: "Doodle",
    parentTag: "a",
    parentClassName: "footer-logo",
    nearestHref: "https://doodle.com/en/",
    nearestText: "",
  })

  assert.equal(role, "logo")
})

test("inferSvgRoleHint identifies social icons", () => {
  const role = inferSvgRoleHint({
    alt: "FacebookSquareIcon",
    parentTag: "a",
    parentClassName: "social-links",
    nearestHref: "https://www.facebook.com/DoodleAG",
    nearestText: "",
  })

  assert.equal(role, "social-icon")
})

test("inferSvgRoleHint identifies chevrons from trigger labels", () => {
  const role = inferSvgRoleHint({
    alt: "Products",
    parentTag: "button",
    parentClassName: "navigation-trigger",
    nearestHref: "",
    nearestText: "Products ChevronDownIcon",
  })

  assert.equal(role, "chevron")
})

test("normalizeStandaloneSvg adds xmlns when missing", () => {
  const normalized = normalizeStandaloneSvg('<svg width="24" height="24"><path d="M0 0" /></svg>')

  assert.match(normalized, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
})

test("normalizeStandaloneSvg preserves existing xmlns", () => {
  const input = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"></svg>'
  const normalized = normalizeStandaloneSvg(input)

  assert.equal(normalized, input)
})

test("normalizeStandaloneSvg unwraps nested standalone svg documents", () => {
  const normalized = normalizeStandaloneSvg('<svg width="24" height="24"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0" /></svg></svg>')

  assert.equal(normalized, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0" /></svg>')
})

test("normalizeStandaloneSvg unwraps nested standalone svg documents with outer title metadata", () => {
  const normalized = normalizeStandaloneSvg('<svg width="24" height="24"><title>LinkedinSmallIcon</title><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0" /></svg></svg>')

  assert.equal(normalized, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0" /></svg>')
})

test("deriveShellSummary produces deduplicated build-facing shell data", () => {
  const summary = deriveShellSummary({
    url: "https://doodle.com/en/integrations/",
    totalImages: 0,
    sections: [],
    shellSections: [
      {
        index: 0,
        label: "01-Header",
        sectionTag: "header",
        interactionMode: "unknown",
        controls: [
          { kind: "link", text: "", href: "https://doodle.com/", className: "", width: 79, height: 19, childWidths: [79], lastChildHasLeftBorder: false, parentTag: "div", parentClassName: "", roleHint: "unknown" },
          { kind: "button", text: "ProductsChevronDownIcon", href: "", className: "ghost-button trigger", width: 105, height: 36, childWidths: [61, 20], lastChildHasLeftBorder: false, parentTag: "nav", parentClassName: "", roleHint: "nav-trigger" },
          { kind: "link", text: "Integrations", href: "https://doodle.com/en/integrations/", className: "ghost-button", width: 80, height: 21, childWidths: [], lastChildHasLeftBorder: false, parentTag: "div", parentClassName: "", roleHint: "unknown" },
          { kind: "link", text: "Pricing", href: "https://doodle.com/en/premium", className: "ghost-button", width: 52, height: 21, childWidths: [], lastChildHasLeftBorder: false, parentTag: "div", parentClassName: "", roleHint: "unknown" },
          { kind: "button", text: "Log in", href: "", className: "ghost-button brandcolor", width: 56, height: 29, childWidths: [40], lastChildHasLeftBorder: false, parentTag: "div", parentClassName: "", roleHint: "action", backgroundColor: "rgba(0, 0, 0, 0)", textColor: "rgb(10, 11, 12)", border: "0px none rgb(0, 0, 0)", borderRadius: 9999, paddingTop: 9, paddingRight: 8, paddingBottom: 9, paddingLeft: 8 },
          { kind: "button", text: "Sign up", href: "", className: "button secondary", width: 64, height: 29, childWidths: [48], lastChildHasLeftBorder: false, parentTag: "div", parentClassName: "", roleHint: "action", backgroundColor: "rgba(0, 0, 0, 0)", textColor: "rgb(10, 11, 12)", border: "0px none rgb(0, 0, 0)", borderRadius: 9999, paddingTop: 9, paddingRight: 8, paddingBottom: 9, paddingLeft: 8 },
          { kind: "button", text: "Sign up", href: "", className: "button secondary", width: 64, height: 29, childWidths: [48], lastChildHasLeftBorder: false, parentTag: "div", parentClassName: "", roleHint: "action", backgroundColor: "rgba(0, 0, 0, 0)", textColor: "rgb(10, 11, 12)", border: "0px none rgb(0, 0, 0)", borderRadius: 9999, paddingTop: 9, paddingRight: 8, paddingBottom: 9, paddingLeft: 8 },
          { kind: "link", text: "Create a Doodle", href: "https://doodle.com/create", className: "button primary", width: 132, height: 29, childWidths: [116], lastChildHasLeftBorder: false, parentTag: "div", parentClassName: "", roleHint: "action", backgroundColor: "rgb(212, 165, 245)", textColor: "rgb(10, 11, 12)", border: "0px none rgb(0, 0, 0)", borderRadius: 9999, paddingTop: 12, paddingRight: 16, paddingBottom: 12, paddingLeft: 16 },
        ],
        inlineSvgs: [
          {
            outerHTML: "<svg />",
            localPath: "images/logo.svg",
            alt: "inline-svg-0",
            width: 10,
            height: 10,
            parentTag: "a",
            parentClassName: "",
            nearestHref: "https://doodle.com/",
            nearestText: "",
            roleHint: "logo",
            domOrder: 0,
          },
          {
            outerHTML: "<svg />",
            localPath: "images/products.svg",
            alt: "Products",
            width: 10,
            height: 10,
            parentTag: "button",
            parentClassName: "",
            nearestHref: "",
            nearestText: "Products ChevronDownIcon",
            roleHint: "chevron",
            domOrder: 1,
          },
        ],
        expandedTriggers: [
          {
            label: "Products",
            kind: "button",
            roleHint: "nav-trigger",
            interactionMode: "click",
            items: [
              { label: "Integrations", href: "https://doodle.com/en/integrations/", kind: "link", className: "drawer-item", width: 280, height: 96, backgroundColor: "rgb(255, 255, 255)", border: "0px none rgb(0, 0, 0)", borderRadius: 12, paddingTop: 20, paddingRight: 20, paddingBottom: 20, paddingLeft: 20 },
            ],
            panel: {
              width: 636,
              height: 412,
              layoutMode: "grid",
              columnCount: 2,
              rowGap: 12,
              columnGap: 12,
              borderRadius: 24,
              offsetX: 0,
              offsetY: 10,
              averageItemWidth: 280,
              averageItemHeight: 96,
              containerClassName: "drawer-panel",
              backgroundColor: "rgb(255, 255, 255)",
              border: "1px solid rgb(231, 231, 231)",
              boxShadow: "rgba(0, 0, 0, 0.16) 0px 24px 70px 0px",
              paddingTop: 12,
              paddingRight: 12,
              paddingBottom: 12,
              paddingLeft: 12,
            },
          },
        ],
        wrappers: [
          { role: "logo", className: "header-logo", width: 79, height: 18, backgroundColor: "rgba(0, 0, 0, 0)", display: "flex", justifyContent: "flex-start", justifySelf: "auto", alignItems: "stretch", alignSelf: "auto", marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 },
          { role: "unknown", className: "navigation", width: 555, height: 36, backgroundColor: "rgba(0, 0, 0, 0)", display: "block", justifyContent: "normal", justifySelf: "auto", alignItems: "stretch", alignSelf: "auto", marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 },
          { role: "unknown", className: "actions", width: 267, height: 40, backgroundColor: "rgba(0, 0, 0, 0)", display: "flex", justifyContent: "normal", justifySelf: "auto", alignItems: "center", alignSelf: "auto", marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 },
        ],
      },
      {
        index: 8,
        label: "09-Footer",
        sectionTag: "footer",
        interactionMode: "unknown",
        controls: [
          { kind: "link", text: "HomeIcon", href: "https://doodle.com/en/", className: "", width: 24, height: 24, childWidths: [24], lastChildHasLeftBorder: false, parentTag: "div", parentClassName: "", roleHint: "unknown" },
          { kind: "link", text: "Integrations", href: "https://doodle.com/en/integrations/", className: "", width: 80, height: 21, childWidths: [], lastChildHasLeftBorder: false, parentTag: "div", parentClassName: "", roleHint: "unknown" },
          { kind: "link", text: "FacebookSquareIcon", href: "https://facebook.com/doodle", className: "", width: 24, height: 24, childWidths: [24], lastChildHasLeftBorder: false, parentTag: "div", parentClassName: "", roleHint: "social-link" },
          { kind: "button", text: "EnglishChevronDownIcon", href: "", className: "language-trigger", width: 212, height: 33, childWidths: [163, 35], lastChildHasLeftBorder: true, parentTag: "div", parentClassName: "", roleHint: "language-trigger" },
          { kind: "link", text: "Help", href: "https://help.doodle.com", className: "", width: 32, height: 21, childWidths: [], lastChildHasLeftBorder: false, parentTag: "div", parentClassName: "", roleHint: "unknown" },
          { kind: "link", text: "Legal Notice", href: "https://doodle.com/en/legal-notice/", className: "", width: 80, height: 18, childWidths: [], lastChildHasLeftBorder: false, parentTag: "div", parentClassName: "", roleHint: "legal-link" },
        ],
        inlineSvgs: [
          {
            outerHTML: "<svg />",
            localPath: "images/facebook.svg",
            alt: "Facebook",
            width: 10,
            height: 10,
            parentTag: "a",
            parentClassName: "",
            nearestHref: "https://facebook.com/doodle",
            nearestText: "",
            roleHint: "social-icon",
            domOrder: 0,
          },
          {
            outerHTML: "<svg />",
            localPath: "images/chevron.svg",
            alt: "EnglishChevronDownIcon",
            width: 10,
            height: 10,
            parentTag: "button",
            parentClassName: "",
            nearestHref: "",
            nearestText: "EnglishChevronDownIcon",
            roleHint: "chevron",
            domOrder: 1,
          },
        ],
        expandedTriggers: [
          {
            label: "English",
            kind: "button",
            roleHint: "language-trigger",
            interactionMode: "click",
            items: [
              { label: "English", href: "", kind: "button", className: "dropdown-item", width: 212, height: 33, backgroundColor: "rgb(255, 255, 255)", border: "0px none rgb(0, 0, 0)", borderRadius: 0, paddingTop: 0, paddingRight: 16, paddingBottom: 0, paddingLeft: 16 },
              { label: "Deutsch", href: "", kind: "button", className: "dropdown-item", width: 212, height: 33, backgroundColor: "rgb(255, 255, 255)", border: "0px none rgb(0, 0, 0)", borderRadius: 0, paddingTop: 0, paddingRight: 16, paddingBottom: 0, paddingLeft: 16 },
            ],
            panel: {
              width: 212,
              height: 164,
              layoutMode: "list",
              columnCount: 1,
              rowGap: 0,
              columnGap: 0,
              borderRadius: 4,
              offsetX: 0,
              offsetY: 8,
              averageItemWidth: 212,
              averageItemHeight: 33,
              containerClassName: "language-menu",
              backgroundColor: "rgb(255, 255, 255)",
              border: "1px solid rgb(216, 216, 216)",
              boxShadow: "none",
              paddingTop: 0,
              paddingRight: 0,
              paddingBottom: 0,
              paddingLeft: 0,
            },
          },
        ],
        wrappers: [
          { role: "breadcrumb", className: "breadcrumb-wrapper", width: 180, height: 24, backgroundColor: "rgb(0, 0, 0)", display: "block", justifyContent: "normal", justifySelf: "auto", alignItems: "stretch", alignSelf: "auto", marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 },
          { role: "logo", className: "logo-wrapper", width: 105, height: 18, backgroundColor: "rgb(0, 0, 0)", display: "flex", justifyContent: "flex-start", justifySelf: "auto", alignItems: "stretch", alignSelf: "auto", marginTop: 40, marginRight: 0, marginBottom: 40, marginLeft: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 },
          { role: "social", className: "social-wrapper", width: 1140, height: 24, backgroundColor: "rgb(0, 0, 0)", display: "flex", justifyContent: "flex-start", justifySelf: "auto", alignItems: "stretch", alignSelf: "auto", marginTop: 0, marginRight: 0, marginBottom: 64, marginLeft: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 },
          { role: "top-navigation", className: "top-navigation-wrapper", width: 360, height: 21, backgroundColor: "rgb(0, 0, 0)", display: "block", justifyContent: "normal", justifySelf: "auto", alignItems: "stretch", alignSelf: "auto", marginTop: 0, marginRight: 0, marginBottom: 48, marginLeft: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 },
          { role: "language-picker", className: "language-picker-wrapper", width: 212, height: 33, backgroundColor: "rgb(0, 0, 0)", display: "block", justifyContent: "normal", justifySelf: "end", alignItems: "stretch", alignSelf: "auto", marginTop: 0, marginRight: 0, marginBottom: 48, marginLeft: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 },
          { role: "divider", className: "divider-wrapper", width: 520, height: 1, backgroundColor: "rgb(255, 255, 255)", display: "block", justifyContent: "normal", justifySelf: "auto", alignItems: "stretch", alignSelf: "auto", marginTop: 0, marginRight: 0, marginBottom: 32, marginLeft: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 },
          { role: "bottom-navigation", className: "bottom-navigation-wrapper", width: 520, height: 21, backgroundColor: "rgb(0, 0, 0)", display: "block", justifyContent: "normal", justifySelf: "auto", alignItems: "stretch", alignSelf: "auto", marginTop: 0, marginRight: 0, marginBottom: 64, marginLeft: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 },
          { role: "privacy", className: "privacy-wrapper", width: 210, height: 18, backgroundColor: "rgb(0, 0, 0)", display: "flex", justifyContent: "center", justifySelf: "auto", alignItems: "stretch", alignSelf: "auto", marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 },
        ],
      },
    ],
  })

  assert.equal(summary.header?.logoPath, "images/logo.svg")
  assert.equal(summary.header?.logoWidth, 10)
  assert.equal(summary.header?.logoHeight, 10)
  assert.equal(summary.header?.navGroups.length, 1)
  assert.equal(summary.header?.navGroups[0]?.label, "Products")
  assert.deepEqual(summary.header?.navGroups[0]?.items.map(item => item.label), ["Integrations"])
  assert.deepEqual(summary.header?.topLinks.map(item => item.label), ["Pricing"])
  assert.deepEqual(summary.header?.actions.map(item => item.label), ["Log in", "Sign up", "Create a Doodle"])
  assert.equal(summary.header?.actions[0]?.variantHint, "ghost")
  assert.equal(summary.header?.actions[1]?.variantHint, "secondary")
  assert.equal(summary.header?.actions[2]?.variantHint, "primary")
  assert.equal(summary.header?.actions[1]?.backgroundColor, "rgba(0, 0, 0, 0)")
  assert.equal(summary.header?.actions[1]?.border, "0px none rgb(0, 0, 0)")
  assert.deepEqual(summary.header?.expandedTriggers[0]?.items.map(item => item.label), ["Integrations"])
  assert.equal(summary.header?.expandedTriggers[0]?.panel?.layoutMode, "grid")
  assert.equal(summary.header?.expandedTriggers[0]?.panel?.columnCount, 2)
  assert.equal(summary.header?.expandedTriggers[0]?.panel?.averageItemHeight, 96)
  assert.equal(summary.header?.expandedTriggers[0]?.panel?.backgroundColor, "rgb(255, 255, 255)")
  assert.equal(summary.header?.expandedTriggers[0]?.items[0]?.borderRadius, 12)

  assert.deepEqual(summary.footer?.breadcrumbLinks.map(item => item.label), ["Home", "Integrations"])
  assert.deepEqual(summary.footer?.socialLinks.map(item => item.label), ["Facebook Square"])
  assert.deepEqual(summary.footer?.socialIconPaths, ["images/facebook.svg"])
  assert.equal(summary.footer?.languageControl?.label, "English")
  assert.equal(summary.footer?.logoPath, "images/logo.svg")
  assert.equal(summary.footer?.languageChevronPath, "images/chevron.svg")
  assert.deepEqual(summary.footer?.languageControl?.childWidths, [163, 35])
  assert.equal(summary.footer?.languageControl?.lastChildHasLeftBorder, true)
  assert.deepEqual(summary.footer?.expandedTriggers[0]?.items.map(item => item.label), ["English", "Deutsch"])
  assert.equal(summary.footer?.expandedTriggers[0]?.panel?.layoutMode, "list")
  assert.equal(summary.footer?.expandedTriggers[0]?.panel?.offsetY, 8)
  assert.equal(summary.footer?.expandedTriggers[0]?.panel?.backgroundColor, "rgb(255, 255, 255)")
  assert.deepEqual(summary.footer?.wrapperOrder.map(item => item.role), [
    "breadcrumb",
    "logo",
    "social",
    "top-navigation",
    "language-picker",
    "divider",
    "bottom-navigation",
    "privacy",
  ])
  assert.equal(summary.footer?.wrapperOrder[2]?.justifyContent, "flex-start")
  assert.equal(summary.footer?.wrapperOrder[4]?.justifySelf, "end")
  assert.equal(summary.footer?.wrapperOrder[1]?.marginTop, 40)
  assert.equal(summary.footer?.wrapperOrder[2]?.marginBottom, 64)
  assert.equal(summary.footer?.wrapperOrder[3]?.marginBottom, 48)
  assert.deepEqual(summary.footer?.primaryLinks.map(item => item.label), ["Help"])
  assert.deepEqual(summary.footer?.legalLinks.map(item => item.label), ["Legal Notice"])
})
