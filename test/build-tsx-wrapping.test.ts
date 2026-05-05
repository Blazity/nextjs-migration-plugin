import { describe, it, expect } from "vitest";
import { transformOrWrap, detectNextImports, escapeUnsafeLessThan } from "../lib/build.ts";

describe("escapeUnsafeLessThan", () => {
  it("escapes `<` followed by a digit (the <5kB case)", () => {
    expect(escapeUnsafeLessThan("Lightweight (<5kB gzipped)")).toBe("Lightweight (&lt;5kB gzipped)");
  });

  it("preserves real opening tags like <Image> and <div>", () => {
    expect(escapeUnsafeLessThan("<Image /> and <div>x</div>")).toBe("<Image /> and <div>x</div>");
  });

  it("preserves close tags like </div>", () => {
    expect(escapeUnsafeLessThan("<div>x</div>")).toBe("<div>x</div>");
  });

  it("preserves comment-like markers <!", () => {
    expect(escapeUnsafeLessThan("<!-- raw -->")).toBe("<!-- raw -->");
  });

  it("escapes consecutive non-tag <s in math copy", () => {
    expect(escapeUnsafeLessThan("a < b < c")).toBe("a &lt; b &lt; c");
  });
});

describe("detectNextImports", () => {
  it("emits no imports when no Next.js component is referenced", () => {
    expect(detectNextImports('<div className="foo">hi</div>')).toBe("");
  });

  it("injects `import Image from \"next/image\"` when <Image> is referenced", () => {
    const result = detectNextImports('<Image src="/x.png" alt="" width={1} height={1} />');
    expect(result).toContain('import Image from "next/image";');
  });

  it("injects multiple imports when multiple components are referenced", () => {
    const result = detectNextImports('<Image src="/x" /> <Link href="/">go</Link>');
    expect(result).toContain('import Image from "next/image";');
    expect(result).toContain('import Link from "next/link";');
  });

  it("ignores partial matches (Imageless does not match Image)", () => {
    expect(detectNextImports("<Imageless />")).toBe("");
  });
});

describe("transformOrWrap", () => {
  it("renames the existing default export when the input is already a component", () => {
    const result = transformOrWrap("export default function Foo(){ return <div/>; }", "MyComponent");
    expect(result).toContain("export default function MyComponent");
    expect(result).not.toContain("function Foo");
  });

  it("wraps a raw JSX fragment in a default-export function returning a fragment", () => {
    const raw = '<div className="hero">Hello</div>';
    const result = transformOrWrap(raw, "PageHero");
    expect(result).toMatch(/export default function PageHero\(\)/);
    expect(result).toMatch(/return\s*\(\s*<>/);
    expect(result).toContain('<div className="hero">Hello</div>');
    expect(result).toMatch(/<\/>\s*\);/);
  });

  it("strips leading JSX expression-comments before wrapping", () => {
    const raw = '{/* Auto-generated */}\n{/* Source: x.md */}\n\n<div>body</div>';
    const result = transformOrWrap(raw, "Page");
    expect(result.startsWith("{/*")).toBe(false);
    expect(result).toContain("<div>body</div>");
  });

  it("injects an Image import when the wrapped JSX references <Image>", () => {
    const raw = '<Image src="/x.png" alt="x" width={10} height={10} />';
    const result = transformOrWrap(raw, "Hero");
    expect(result).toContain('import Image from "next/image";');
    expect(result.indexOf('import Image from')).toBeLessThan(result.indexOf("export default"));
  });

  it("escapes unsafe `<` in raw text content before wrapping (issue 009)", () => {
    const raw = '<p>Lightweight Client SDK (<5kB gzipped)</p>';
    const result = transformOrWrap(raw, "OpenSourceFeatureList");
    expect(result).toContain("&lt;5kB");
    expect(result).not.toContain("(<5kB");
  });

  it("does not escape `<` inside pre-wrapped components (preserves their JSX as authored)", () => {
    const raw = `export default function H() { return <p>a < b</p>; }`;
    const result = transformOrWrap(raw, "Hero");
    // Pre-wrapped path: do not touch — the input is already valid JSX OR
    // already broken at the source. Escaping inside attribute values would
    // corrupt valid attributes.
    expect(result).toContain("a < b");
  });

  it("does not double-import or double-wrap when input is already a component referencing Image", () => {
    const raw = `import Image from "next/image";

export default function H() {
  return <Image src="/x.png" alt="x" width={1} height={1} />;
}`;
    const result = transformOrWrap(raw, "Hero");
    expect(result).toContain("export default function Hero");
    // Pre-wrapped path: do NOT inject another `import Image` line.
    const importMatches = result.match(/import Image from "next\/image";/g) ?? [];
    expect(importMatches).toHaveLength(1);
  });
});
