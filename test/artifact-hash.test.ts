import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashArtifact } from "../lib/artifact-hash.ts";

function sha256Prefix(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

describe("hashArtifact", () => {
  it("produces the same 16-char SHA256 prefix for structurally equal records", () => {
    const record = {
      approved: false,
      componentGroupId: "hero-primary",
      meta: {
        priority: 1,
        tags: ["hero", "cta"],
      },
      nullable: null,
    };
    const sameRecord = {
      approved: false,
      componentGroupId: "hero-primary",
      meta: {
        priority: 1,
        tags: ["hero", "cta"],
      },
      nullable: null,
    };

    const hash = hashArtifact(record);

    expect(hash).toBe(hashArtifact(sameRecord));
    expect(hash).toBe(sha256Prefix(
      "{\"approved\":false,\"componentGroupId\":\"hero-primary\",\"meta\":{\"priority\":1,\"tags\":[\"hero\",\"cta\"]},\"nullable\":null}",
    ));
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("produces different hashes when one field differs", () => {
    const base = {
      componentGroupId: "hero-primary",
      revision: 1,
    };
    const changed = {
      componentGroupId: "hero-primary",
      revision: 2,
    };

    expect(hashArtifact(base)).not.toBe(hashArtifact(changed));
  });

  it("is order-insensitive for object keys via recursive canonicalization", () => {
    const first = {
      z: "last",
      a: {
        y: 2,
        x: 1,
      },
      items: [
        {
          b: true,
          a: false,
        },
      ],
    };
    const second = {
      items: [
        {
          a: false,
          b: true,
        },
      ],
      a: {
        x: 1,
        y: 2,
      },
      z: "last",
    };

    expect(hashArtifact(first)).toBe(hashArtifact(second));
  });
});
