import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  REVIEWER_LISTING,
  assertReviewerPlan,
  publicReviewerPlan,
  reviewerCredentialPlan,
} from "./seed-reviewer-demo.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("reviewer demo seed", () => {
  it("stays idle until Kyle sets both passwords, and never echoes them", () => {
    const empty = reviewerCredentialPlan({});
    assert.equal(assertReviewerPlan(empty), "skipped");
    assert.equal(empty.parentEmail, "reviewer.parent@kidease.ca");
    assert.equal(empty.daycareEmail, "reviewer.daycare@kidease.ca");
    const printed = JSON.stringify(publicReviewerPlan({ ...empty, parentPassword: "not-for-logs", daycarePassword: "also-not" }));
    assert.equal(printed.includes("not-for-logs"), false);
    assert.equal(printed.includes("also-not"), false);

    const ready = reviewerCredentialPlan({
      REVIEWER_PARENT_PASSWORD: "parent-demo-pass",
      REVIEWER_DAYCARE_PASSWORD: "centre-demo-pass",
    });
    assert.equal(assertReviewerPlan(ready), "ready");
    assert.throws(() => assertReviewerPlan({ ...ready, parentPassword: "short" }), /8 characters/);
    assert.throws(
      () => assertReviewerPlan({ ...ready, daycareEmail: "kyle@kidease.ca" }),
      /operator mailbox/,
    );
  });

  it("marks the demo centre so public search drops it, with no invented fee or rating", () => {
    assert.match(REVIEWER_LISTING.name, /^QA[ _-]/);
    assert.match(REVIEWER_LISTING.slug, /^qa[_-]/);
    assert.match(REVIEWER_LISTING.address, /KidEase Test/i);
    assert.equal(REVIEWER_LISTING.licenseNumber.startsWith("QA-"), true);
    const script = read("scripts/seed-reviewer-demo.mjs");
    assert.match(script, /visibility = 'admin_only'/);
    assert.match(script, /is_test = 1/);
    assert.match(script, /rating_x10 = 0/);
    assert.match(script, /review_count = 0/);
    assert.match(script, /infant_monthly = null/);
    assert.match(script, /photos = ''/);
    assert.match(script, /Not a real licensed daycare/);
    assert.doesNotMatch(script, /REVIEWER_PARENT_PASSWORD\s*=\s*["'`][^"'`]+["'`]/);
    assert.doesNotMatch(script, /REVIEWER_DAYCARE_PASSWORD\s*=\s*["'`][^"'`]+["'`]/);
    const logs = [...script.matchAll(/console\.(?:log|error|info|warn)\(([\s\S]*?)\);/g)].map((m) => m[1]);
    assert.ok(logs.length >= 1);
    for (const body of logs) {
      assert.doesNotMatch(body, /parentPassword|daycarePassword/);
    }
    assert.doesNotMatch(read("scripts/migrate.mjs"), /applyReviewerDemoFromEnv/);
    assert.match(script, /qa-reviewer-reply/);
    assert.match(script, /daycare demo reply/);
    assert.doesNotMatch(script, /Reply STOP/);
    assert.match(read("package.json"), /ops:reviewer-demo/);
    assert.match(read(".env.example"), /# REVIEWER_PARENT_PASSWORD=/);
    assert.match(read(".env.example"), /# REVIEWER_DAYCARE_PASSWORD=/);
    assert.doesNotMatch(read(".env.example"), /^REVIEWER_PARENT_PASSWORD=.+/m);
  });

  it("grants the reviewer parent complimentary Parent Plus with no purchase and no price", () => {
    const script = read("scripts/seed-reviewer-demo.mjs");
    assert.match(script, /grantComplimentaryParentPlus\(client, parentId\)/);
    assert.match(script, /plus_plan = 'plus'/);
    assert.match(script, /plus_status = 'active'/);
    assert.match(script, /plus_subscription_id = null/);
    assert.match(script, /and role = 'parent'/);
    assert.doesNotMatch(script, /grantComplimentaryParentPlus\(client, daycareId\)/);
    assert.doesNotMatch(script, /CA\$|price_|checkout\.session|stripe_subscription_id = 'sub_|plus_subscription_id = 'sub_/);
    assert.match(script, /parentPlus=complimentary/);
    assert.match(read("docs/store-review-notes.md"), /complimentary Parent Plus/);
    assert.match(read("docs/store-review-notes.md"), /No purchase and no price/);
    assert.doesNotMatch(read("docs/store-review-notes.md"), /CA\$/);

    const videoRoute = read("src/routes/video.$roomId.tsx");
    assert.match(videoRoute, /nativeShell && paywall && !canMint/);
    assert.match(videoRoute, /data-ke="native-video-entitlement"/);
    assert.match(videoRoute, /data-ke="video-join"/);
    const nativeAt = videoRoute.indexOf('data-ke="native-video-entitlement"');
    const joinAt = videoRoute.indexOf('data-ke="video-join"');
    assert.ok(nativeAt > 0 && joinAt > nativeAt);
    const nativeBlock = videoRoute.slice(Math.max(0, nativeAt - 180), nativeAt + 420);
    const joinBlock = videoRoute.slice(joinAt, joinAt + 420);
    assert.match(nativeBlock, /nativeVideoNeedsPlus/);
    assert.doesNotMatch(nativeBlock, /parentPlusSubscribe|videoPlusRequired|CA\$|plusPrice/);
    assert.match(joinBlock, /t\("videoJoin"\)/);
    assert.doesNotMatch(joinBlock, /parentPlusSubscribe|nativeVideoNeedsPlus|videoPlusRequired|CA\$|plusPrice/);
    const promptAt = videoRoute.indexOf('data-ke="parent-plus-prompt"');
    const webPaywall = videoRoute.slice(promptAt - 220, joinAt);
    assert.match(webPaywall, /!nativeShell && paywall/);
    assert.match(webPaywall, /parentPlusSubscribe/);
  });
});
