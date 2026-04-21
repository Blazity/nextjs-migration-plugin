import { describe, it, expect } from "vitest";
import { checkPluginDependencies } from "../lib/session-check.ts";

describe("checkPluginDependencies", () => {
  it("returns { ok: true } when superpowers is present", () => {
    const result = checkPluginDependencies({
      installedPlugins: ["superpowers", "some-other-plugin"],
      required: ["superpowers"],
    });
    expect(result.ok).toBe(true);
  });

  it("returns { ok: false, missing } when a required plugin is absent", () => {
    const result = checkPluginDependencies({
      installedPlugins: ["some-other-plugin"],
      required: ["superpowers"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toEqual(["superpowers"]);
    }
  });

  it("returns a helpful message string on missing deps", () => {
    const result = checkPluginDependencies({
      installedPlugins: [],
      required: ["superpowers"],
    });
    if (!result.ok) {
      expect(result.message).toContain("superpowers");
      expect(result.message).toContain("install");
    }
  });
});
