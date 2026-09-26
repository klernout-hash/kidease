import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  adminAddonLine,
  featuredPinForCentre,
  jobPostSpend,
  pickUnspentJobCredit,
  resolveAddonCentre,
} from "../src/lib/centre-addons.ts";
import { compareWithPaidPins } from "../src/lib/provider-entitlements.ts";
import { DAYCARE_ADDONS } from "../src/lib/upgrade-plans.ts";
import { addonCheckoutMode } from "../src/lib/server/stripe-catalog.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("checkout names one owned centre", () => {
  assert.equal(resolveAddonCentre(["centre_a"], null), "centre_a");
  assert.equal(resolveAddonCentre(["centre_a", "centre_b"], "centre_b"), "centre_b");
  assert.equal(resolveAddonCentre(["centre_a", "centre_b"], null), null);
  assert.equal(resolveAddonCentre(["centre_a"], "centre_b"), null);
  assert.match(src("src/lib/server/provider-subscriptions.ts"), /Choose the centre this add-on is for/);
  assert.match(src("src/components/provider-subscription.tsx"), /centreId: centreId \|\| null/);
});

test("Featured city pins only the bought centre, and the pin is placement not score", () => {
  assert.equal(addonCheckoutMode("featured_city"), "subscription");
  assert.equal(DAYCARE_ADDONS.find((addon) => addon.id === "featured_city").amountCad, 29);
  assert.equal(
    featuredPinForCentre({ pro: false, addonActive: true, purchasedCentreId: "centre_a", centreId: "centre_a" }),
    true,
  );
  assert.equal(
    featuredPinForCentre({ pro: false, addonActive: true, purchasedCentreId: "centre_a", centreId: "centre_b" }),
    false,
  );
  assert.equal(
    featuredPinForCentre({ pro: true, addonActive: false, purchasedCentreId: null, centreId: "centre_b" }),
    true,
  );
  assert.equal(
    featuredPinForCentre({ pro: false, addonActive: false, purchasedCentreId: "centre_a", centreId: "centre_a" }),
    false,
  );
  assert.equal(
    featuredPinForCentre({ pro: false, addonActive: true, purchasedCentreId: null, centreId: "centre_b" }),
    true,
  );

  const plain = { id: "plain", featuredCity: false, priority: false, score: 90 };
  const pinned = { id: "pinned", featuredCity: true, priority: false, score: 10 };
  assert.ok(compareWithPaidPins(plain, pinned, (a, b) => b.score - a.score) > 0);
  assert.ok(compareWithPaidPins(pinned, plain, (a, b) => b.score - a.score) < 0);
  const search = src("src/lib/server/daycares.ts");
  assert.match(search, /compareWithPaidPins/);
  assert.match(search, /mergePinnedCentres/);
  assert.match(src("src/lib/server/provider-entitlements.ts"), /featuredCentreIdsInLock/);
  const match = src("src/lib/parent-match.ts");
  assert.match(match, /featured-city, and promote pins never enter this score/);
  assert.doesNotMatch(match, /featuredCity/);
});

test("Claim boost moves only the bought centre ahead for 30 days", () => {
  assert.equal(addonCheckoutMode("claim_boost"), "payment");
  assert.equal(DAYCARE_ADDONS.find((addon) => addon.id === "claim_boost").amountCad, 99);
  const life = src("src/lib/server/stripe-lifecycle.ts");
  assert.match(life, /interval '30 days'/);
  assert.match(life, /d\.id = \$\{target\}/);
  assert.match(life, /claim_boost_centre_id/);
  assert.match(src("src/lib/server/claims.ts"), /applyPendingClaimBoost/);
  const boosted = { id: "boost", priority: true, featuredCity: false };
  const featured = { id: "pin", priority: false, featuredCity: true };
  assert.ok(compareWithPaidPins(featured, boosted, () => 0) > 0);
});

test("Job post credit is spent on the bought centre and publishes an opening", () => {
  assert.equal(addonCheckoutMode("job_post"), "payment");
  assert.equal(DAYCARE_ADDONS.find((addon) => addon.id === "job_post").amountCad, 49);
  assert.equal(jobPostSpend({ credits: 1, purchasedCentreId: "centre_a", centreId: "centre_a", role: "ECE" }).ok, true);
  assert.equal(
    jobPostSpend({ credits: 1, purchasedCentreId: "centre_a", centreId: "centre_b", role: "ECE" }).reason,
    "centre",
  );
  assert.equal(jobPostSpend({ credits: 0, purchasedCentreId: "centre_a", centreId: "centre_a", role: "ECE" }).reason, "credits");
  assert.equal(jobPostSpend({ credits: 1, purchasedCentreId: "centre_a", centreId: "centre_a", role: "E" }).reason, "role");
  assert.equal(
    pickUnspentJobCredit(
      [
        { paymentId: "pi_b", centreId: "centre_b" },
        { paymentId: "pi_a", centreId: "centre_a" },
      ],
      "centre_a",
    )?.paymentId,
    "pi_a",
  );
  assert.equal(
    pickUnspentJobCredit([{ paymentId: "pi_b", centreId: "centre_b" }], "centre_a"),
    null,
  );
  assert.equal(pickUnspentJobCredit([{ paymentId: "pi_old", centreId: null }], "centre_a")?.paymentId, "pi_old");
  const subs = src("src/lib/server/provider-subscriptions.ts");
  assert.match(subs, /centre_job_credits/);
  assert.match(subs, /centre_job_posts/);
  assert.match(src("src/routes/daycare.$slug.tsx"), /data-ke="centre-jobs"/);
  assert.doesNotMatch(src("src/routes/jobs_.post.tsx"), /job_post_credits|postCentreJob|centre_job_posts/);
  assert.doesNotMatch(src("src/components/jobs-interest-form.tsx"), /job_post_credits|postCentreJob/);
});

test("admin sees active add-ons per centre", () => {
  const now = Date.parse("2026-09-26T00:00:00.000Z");
  assert.equal(
    adminAddonLine({
      featured: true,
      claimUntil: "2026-10-26T00:00:00.000Z",
      jobCredits: 1,
      jobPosts: 2,
      now,
    }),
    "Add-ons: Featured city · Claim boost until 2026-10-26 · 1 job credit · 2 staff openings",
  );
  assert.equal(
    adminAddonLine({ featured: false, claimPending: true, claimUntil: "2020-01-01", now }),
    "Add-ons: Claim boost waiting on the claim",
  );
  assert.equal(adminAddonLine({ featured: false, now }), null);
  assert.match(src("src/lib/server/admin-centres.ts"), /adminAddonLine/);
  assert.match(src("src/components/admin-review-card.tsx"), /admin-centre-addons/);
});
