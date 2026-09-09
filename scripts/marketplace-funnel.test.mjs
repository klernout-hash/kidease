import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { MARKETPLACE_FUNNEL_EVENT } from "../src/lib/marketplace-funnel.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("marketplace_funnel covers search/explore → listing_view → share/contact/claim", () => {
  assert.equal(MARKETPLACE_FUNNEL_EVENT, "marketplace_funnel");
  const helper = src("src/lib/marketplace-funnel.ts");
  assert.match(helper, /listing_view/);
  assert.match(helper, /dest_path/);
  assert.doesNotMatch(helper, /payload\.slug/);
  assert.match(src("src/routes/search.tsx"), /captureMarketplaceFunnel/);
  assert.match(src("src/routes/search.tsx"), /step: "search"/);
  assert.match(src("src/routes/index.tsx"), /step: "explore"/);
  assert.match(src("src/routes/daycare.$slug.tsx"), /step: "listing_view"/);
  assert.match(src("src/routes/daycare.$slug.tsx"), /step: "contact"/);
  assert.match(src("src/components/share-button.tsx"), /step: "share"/);
  assert.match(src("src/routes/claim.tsx"), /step: "claim"/);
  assert.match(src("docs/posthog.md"), /marketplace_funnel/);
});
