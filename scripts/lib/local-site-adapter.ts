import { loadAdapters, type MergedAdapter } from "./adapter-loader.ts";

let cachedLocalAdapter: MergedAdapter | null = null;

export function resolveLocalSiteAdapter(): MergedAdapter {
  if (cachedLocalAdapter) return cachedLocalAdapter;

  const nextjsAdapter = loadAdapters([".ai/adapters/nextjs.json"]);
  cachedLocalAdapter = {
    ...nextjsAdapter,
    sectionDiscovery: {
      ...nextjsAdapter.sectionDiscovery,
      primarySelector: undefined,
    },
  };

  return cachedLocalAdapter;
}
