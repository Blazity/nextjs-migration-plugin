import { describe, expect, it } from "vitest";
import { resolveLocalSiteAdapter } from "../scripts/lib/local-site-adapter.ts";

describe("resolveLocalSiteAdapter", () => {
  it("captures generated nav shells that render as a body-level wrapper containing nav", () => {
    const adapter = resolveLocalSiteAdapter();

    expect(adapter.localSite.sectionSelector).toContain("body > div:has(nav):not(:has(main)):not(:has(footer))");
  });
});
