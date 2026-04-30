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

  it("throws on a non-URL string", () => {
    expect(() => urlToSlug("not a url")).toThrow();
  });
});
