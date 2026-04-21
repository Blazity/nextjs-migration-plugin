import assert from "node:assert/strict";
import test from "node:test";

import { resolveLocalSiteAdapter } from "../lib/local-site-adapter.ts";

test("resolveLocalSiteAdapter preserves nextjs adapter sectionSelector and nullifies primarySelector", () => {
  const localAdapter = resolveLocalSiteAdapter();

  assert.equal(localAdapter.platforms[0], "nextjs");
  assert.equal(localAdapter.sectionDiscovery.primarySelector, undefined);
  assert.equal(localAdapter.localSite.sectionSelector, "body > header, body > nav, main > *, body > footer");
  assert.ok(localAdapter.sectionDiscovery.skipSelectors?.includes("nextjs-portal"));
});
