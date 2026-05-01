import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PageSpecManifestSchema } from "../schemas/page-spec.ts";

const readFixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("PageSpecManifestSchema", () => {
  it("accepts a valid page-spec manifest", () => {
    expect(PageSpecManifestSchema.safeParse(readFixture("page-spec-valid.json")).success).toBe(true);
  });

  it("rejects a non-URL `url`", () => {
    const result = PageSpecManifestSchema.safeParse(readFixture("page-spec-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("url"))).toBe(true);
    }
  });

  it("rejects an empty slug", () => {
    const result = PageSpecManifestSchema.safeParse(readFixture("page-spec-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("slug"))).toBe(true);
    }
  });

  it("rejects negative viewport dimensions", () => {
    const result = PageSpecManifestSchema.safeParse(readFixture("page-spec-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.join(".").startsWith("viewport."))).toBe(true);
    }
  });

  it("rejects a non-ISO extractedAt", () => {
    const result = PageSpecManifestSchema.safeParse(readFixture("page-spec-invalid.json"));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(i => i.path.includes("extractedAt"))).toBe(true);
    }
  });
});
