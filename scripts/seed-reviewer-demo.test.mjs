import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  REVIEWER_LISTING,
  assertReviewerPlan,
  generatedReviewerPasswords,
  publicReviewerPlan,
  reviewerCredentialPlan,
  writeReviewerPasswordFile,
} from "./seed-reviewer-demo.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("reviewer demo seed", () => {
  it("stays idle until Kyle sets the shared password, and never echoes it", () => {
    const empty = reviewerCredentialPlan({});
    assert.equal(assertReviewerPlan(empty), "skipped");
    assert.equal(empty.parentEmail, "reviewer-parent@kidease.ca");
    assert.equal(empty.daycareEmail, "reviewer-provider@kidease.ca");
    const printed = JSON.stringify(publicReviewerPlan({ ...empty, parentPassword: "not-for-logs", daycarePassword: "also-not" }));
    assert.equal(printed.includes("not-for-logs"), false);
    assert.equal(printed.includes("also-not"), false);

    const ready = reviewerCredentialPlan({
      REVIEWER_ACCOUNT_PASSWORD: "shared-demo-pass",
    });
    assert.equal(assertReviewerPlan(ready), "ready");
    assert.equal(ready.parentPassword, ready.daycarePassword);
    assert.throws(() => assertReviewerPlan({ ...ready, parentPassword: "short" }), /8 characters/);
    assert.throws(
      () => assertReviewerPlan({ ...ready, daycareEmail: "kyle@kidease.ca" }),
      /operator mailbox/,
    );
    assert.throws(
      () => assertReviewerPlan({ ...ready, parentEmail: "klernout45@gmail.com" }),
      /protected operator account/,
    );
    assert.throws(
      () => assertReviewerPlan({ ...ready, parentEmail: "john.doe@kidease.ca" }),
      /John Doe or Jonny Doey/,
    );
  });

  it("marks the demo centre so public search drops it, with no invented fee or rating", () => {
    assert.equal(REVIEWER_LISTING.name, "North Elm Family Daycare");
    assert.equal(REVIEWER_LISTING.city, "Winnipeg");
    assert.equal(REVIEWER_LISTING.province, "MB");
    assert.match(REVIEWER_LISTING.slug, /^qa[_-]/);
    assert.doesNotMatch(REVIEWER_LISTING.address, /William Gibson/i);
    assert.equal(REVIEWER_LISTING.licenseNumber.startsWith("QA-"), true);
    const script = read("scripts/seed-reviewer-demo.mjs");
    assert.match(script, /visibility = 'admin_only'/);
    assert.match(script, /is_test = 1/);
    assert.match(script, /is_demo = 1/);
    assert.match(script, /rating_x10 = 0/);
    assert.match(script, /review_count = 0/);
    assert.match(script, /infant_monthly = null/);
    assert.match(script, /\/photos\/community\.jpg,\/photos\/playroom\.jpg/);
    assert.match(script, /Monday to Friday, 7:30 a\.m\. to 5:30 p\.m\./);
    assert.match(script, /qa-reviewer-tour/);
    assert.match(script, /qa-reviewer-waitlist/);
    assert.match(script, /Avery Sample/);
    assert.match(script, /"twoFactorEnabled" = false/);
    assert.match(script, /email_suppressions/);
    assert.match(script, /Not a real licensed daycare/);
    assert.doesNotMatch(script, /REVIEWER_ACCOUNT_PASSWORD\s*=\s*["'`][^"'`]+["'`]/);
    const logs = [...script.matchAll(/console\.(?:log|error|info|warn)\(([\s\S]*?)\);/g)].map((m) => m[1]);
    assert.ok(logs.length >= 1);
    for (const body of logs) {
      assert.doesNotMatch(body, /parentPassword|daycarePassword/);
    }
    assert.match(read("scripts/migrate.mjs"), /preserveProtectedOperatorAccounts/);
    assert.match(read("scripts/migrate.mjs"), /REVIEWER_ACCOUNT_PASSWORD/);
    assert.match(read("scripts/migrate.mjs"), /applyReviewerDemoFromEnv/);
    assert.match(script, /writeReviewerPasswordFile/);
    assert.match(script, /--password-file/);
    assert.match(script, /Rowan Sample/);
    assert.match(script, /No photo/);
    assert.doesNotMatch(script, /photos = 'https|photoUrl|unsplash|child\.jpg/i);
    assert.match(script, /qa-reviewer-reply/);
    assert.match(script, /daycare demo reply/);
    assert.doesNotMatch(script, /Reply STOP/);
    assert.match(read("package.json"), /ops:reviewer-demo/);
    assert.match(read(".env.example"), /# REVIEWER_ACCOUNT_PASSWORD=/);
    assert.doesNotMatch(read(".env.example"), /^REVIEWER_ACCOUNT_PASSWORD=.+/m);
    assert.match(read("src/lib/reviewer-accounts.ts"), /reviewer\.parent@kidease\.ca/);
    assert.match(read("src/lib/reviewer-accounts.ts"), /reviewer-parent@kidease\.ca/);
    assert.match(read("src/lib/reviewer-accounts.ts"), /reviewer-provider@kidease\.ca/);
    assert.doesNotMatch(script, /test-ghost-claim-lab|kidease-docusign-smoke-test|qa-test-photo-upload/);
    assert.match(read("src/components/posthog-boot.tsx"), /quietPostHogForStoreReviewer/);
    assert.match(read("src/lib/ghl-intake.ts"), /reviewer-account/);
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

  it("writes generated passwords to a private file and keeps them out of the script", async () => {
    const generated = generatedReviewerPasswords();
    assert.ok(generated.password.length >= 16);
    assert.equal(generated.parentPassword, generated.daycarePassword);
    const dir = await mkdtemp(join(tmpdir(), "ke-reviewer-"));
    const file = join(dir, "demo-accounts.txt");
    const plan = reviewerCredentialPlan({
      REVIEWER_ACCOUNT_PASSWORD: generated.password,
    });
    await writeReviewerPasswordFile(file, plan);
    const info = await stat(file);
    assert.equal(info.mode & 0o777, 0o600);
    const body = await readFile(file, "utf8");
    assert.match(body, /parent_email=reviewer-parent@kidease\.ca/);
    assert.match(body, /provider_email=reviewer-provider@kidease\.ca/);
    assert.match(body, /North Elm Family Daycare/);
    assert.equal(body.includes(generated.parentPassword), true);
    assert.equal(body.includes(generated.daycarePassword), true);
    assert.doesNotMatch(read("scripts/seed-reviewer-demo.mjs"), new RegExp(generated.parentPassword));
    await rm(dir, { recursive: true, force: true });
  });
});
