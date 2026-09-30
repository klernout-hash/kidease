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
    assert.match(read("package.json"), /ops:reviewer-demo/);
    assert.match(read(".env.example"), /# REVIEWER_PARENT_PASSWORD=/);
    assert.match(read(".env.example"), /# REVIEWER_DAYCARE_PASSWORD=/);
    assert.doesNotMatch(read(".env.example"), /^REVIEWER_PARENT_PASSWORD=.+/m);
  });
});
