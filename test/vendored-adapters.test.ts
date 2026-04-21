import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadAdapter } from "../lib/load-adapter.ts";

const adaptersDir = fileURLToPath(new URL("../adapters/", import.meta.url));

// cookie-consent.json lives in adapters/ but is a cookie-banner provider
// registry, not a platform adapter. It has no `type` field and the agent's
// own validate-adapter.ts rejects it because it has no `validation.sites`.
// Exclude from the AdapterSchema smoke test.
const NON_ADAPTER_FILES = new Set(["cookie-consent.json"]);

describe("vendored adapters", () => {
  const adapterFiles = readdirSync(adaptersDir).filter(f => f.endsWith(".json"));

  adapterFiles.forEach(file => {
    if (NON_ADAPTER_FILES.has(file)) return;
    it(`${file} validates against AdapterSchema`, () => {
      const result = loadAdapter(join(adaptersDir, file));
      if (!result.valid) {
        console.error(`Adapter ${file} has issues:`, result.issues);
      }
      expect(result.valid).toBe(true);
    });
  });
});
