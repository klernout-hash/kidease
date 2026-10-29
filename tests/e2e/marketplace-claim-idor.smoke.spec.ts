/**
 * Tour / waitlist lead contract and the store-review listing document.
 * Loaded by scripts/store-review-readiness.test.mjs (npm test).
 * A live GET is optional: set BASE_URL when the demo row is in that database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { hideListingFromPublicPage } from "../../src/lib/listing-visibility.ts";
import { LEAD_SUBMITTED_EVENT } from "../../src/lib/marketplace-funnel.ts";
import { decideRequest, isDirectDemoListingPath } from "../../scripts/request-guard.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function src(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

export const DEMO_LISTING_PATH = "/daycare/qa-reviewer-demo-centre";

test("a direct demo slug is a public document with noindex", () => {
  assert.equal(isDirectDemoListingPath(DEMO_LISTING_PATH), true);
  assert.equal(isDirectDemoListingPath(`/fr${DEMO_LISTING_PATH}`), true);
  assert.deepEqual(decideRequest({ host: "www.kidease.ca", pathname: DEMO_LISTING_PATH }), { action: "next" });
  assert.equal(
    hideListingFromPublicPage(
      { slug: "qa-reviewer-demo-centre", name: "QA Reviewer Demo Centre", isDemo: 1, visibility: "admin_only" },
      false,
    ),
    false,
  );
  const vercel = src("vercel.json");
  assert.match(vercel, /\/daycare\/qa-reviewer-demo-centre/);
  assert.match(vercel, /noindex, nofollow/);
  assert.match(src("server/middleware/request-guard.ts"), /isDirectDemoListingPath/);
  assert.match(src("src/routes/daycare.$slug.tsx"), /X-Robots-Tag/);
  assert.match(src("src/routes/fr.daycare.$slug.tsx"), /X-Robots-Tag/);
});

test("tour and waitlist submits emit lead_submitted beside the marketplace funnel", () => {
  assert.equal(LEAD_SUBMITTED_EVENT, "lead_submitted");
  const funnel = src("src/lib/marketplace-funnel.ts");
  assert.match(funnel, /daycareSlug/);
  assert.match(funnel, /requestType/);
  assert.match(funnel, /role/);
  assert.match(funnel, /captureMarketplaceFunnel/);
  const tour = src("src/components/request-tour.tsx");
  assert.match(tour, /captureLeadSubmitted\(\{ daycareSlug: daycare\.slug, requestType: "tour"/);
  assert.match(tour, /captureMarketplaceFunnel/);
  const spot = src("src/components/request-spot.tsx");
  assert.match(spot, /requestType: intent === "tour" \? "tour" : "availability"/);
  assert.match(src("src/components/waitlist-opt-in.tsx"), /requestType: "waitlist"/);
});
