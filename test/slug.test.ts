import { describe, it, expect } from "vitest";
import { urlToSlug } from "../lib/slug.ts";

describe("urlToSlug", () => {
  it("returns 'home' for the root path", () => {
    expect(urlToSlug("https://example.com/")).toBe("home");
    expect(urlToSlug("https://example.com")).toBe("home");
  });

  it("uses the last path segment for single-segment URLs", () => {
    expect(urlToSlug("https://example.com/about")).toBe("about");
    expect(urlToSlug("https://example.com/about/")).toBe("about");
  });

  it("joins multi-segment paths with hyphens", () => {
    expect(urlToSlug("https://example.com/blog/intro-post")).toBe("blog-intro-post");
  });

  it("strips query strings and fragments", () => {
    expect(urlToSlug("https://example.com/x?ref=foo#bar")).toBe("x");
  });

  it("lowercases and removes non-url-safe characters", () => {
    expect(urlToSlug("https://example.com/About Us!")).toBe("about-us");
  });

  it("normalizes a path of only slashes to 'home'", () => {
    expect(urlToSlug("https://example.com//")).toBe("home");
  });

  it("lowercases across all path segments", () => {
    expect(urlToSlug("https://example.com/Foo/BAR/baz")).toBe("foo-bar-baz");
  });

  it("decodes percent-encoded spaces before stripping", () => {
    expect(urlToSlug("https://example.com/foo%20bar")).toBe("foo-bar");
  });

  it("degrades on malformed percent-encoding without throwing", () => {
    let result: string;
    expect(() => {
      result = urlToSlug("https://example.com/foo%XX");
    }).not.toThrow();
    expect(result!).not.toBe("");
    expect(result!.startsWith("foo")).toBe(true);
  });

  it("falls back to 'page' for non-ASCII-only paths", () => {
    expect(urlToSlug("https://example.com/中文")).toBe("page");
  });

  it("strips diacritics via NFKD normalization", () => {
    expect(urlToSlug("https://example.com/café")).toBe("cafe");
  });

  it("throws TypeError on a non-URL string", () => {
    expect(() => urlToSlug("not a url")).toThrow(TypeError);
  });
});
