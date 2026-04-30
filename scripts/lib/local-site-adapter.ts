import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAdapters, type MergedAdapter } from "./adapter-loader.ts";

let cachedLocalAdapter: MergedAdapter | null = null;

const NEXTJS_ADAPTER_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../adapters/nextjs.json",
);

export function resolveLocalSiteAdapter(): MergedAdapter {
  if (cachedLocalAdapter) return cachedLocalAdapter;

  const nextjsAdapter = loadAdapters([NEXTJS_ADAPTER_PATH]);
  cachedLocalAdapter = {
    ...nextjsAdapter,
    sectionDiscovery: {
      ...nextjsAdapter.sectionDiscovery,
      primarySelector: undefined,
    },
  };

  return cachedLocalAdapter;
}
