import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadRoutes } from "../lib/load-routes.ts";

const fixturePath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe("loadRoutes", () => {
  it("returns { valid: true } for a valid routes.json", () => {
    const result = loadRoutes(fixturePath("routes-valid.json"));
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.data.routes).toHaveLength(2);
  });

  it("returns { valid: false } for an invalid routes.json", () => {
    expect(loadRoutes(fixturePath("routes-invalid.json")).valid).toBe(false);
  });
});
