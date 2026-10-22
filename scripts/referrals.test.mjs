import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { newReferralCode, normalizeReferralCode, referralDecision, referralPath } from "../src/lib/referrals.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("friend links are codes only, with no payout", () => {
  assert.equal(normalizeReferralCode(" Ab3km9pq "), "ab3km9pq");
  assert.equal(normalizeReferralCode("short"), null);
  assert.equal(normalizeReferralCode("iiiiiiii"), null);
  assert.equal(normalizeReferralCode("abcdefgh"), "abcdefgh");
  assert.equal(newReferralCode(() => 0), "aaaaaaaa");
  assert.equal(referralPath("abcdefgh", "fr"), "/fr/r/abcdefgh");
  assert.equal(referralPath("abcdefgh", "en"), "/r/abcdefgh");
  assert.equal(referralPath("nope", "fr"), "/fr/search");
  assert.equal(referralDecision({ codeOwnerId: "a", referredUserId: "a", alreadyJoined: false }), "self");
  assert.equal(referralDecision({ codeOwnerId: "a", referredUserId: "b", alreadyJoined: true }), "already");
  assert.equal(referralDecision({ codeOwnerId: "a", referredUserId: "b", alreadyJoined: false }), "ok");
  assert.equal(referralDecision({ codeOwnerId: null, referredUserId: "b", alreadyJoined: false }), "missing");

  const blob = [
    src("src/lib/referrals.ts"),
    src("src/lib/server/referrals.ts"),
    src("src/routes/api/referrals.ts"),
    src("src/components/refer-friend-panel.tsx"),
    src("src/components/refer-landing.tsx"),
    src("migrations/0093_referrals.sql"),
  ].join("\n");
  assert.doesNotMatch(blob, /payout|stripe|STORE_PAYMENTS|credit/i);
  assert.match(src("src/lib/copy.ts"), /does not pay you for sharing/);
  assert.match(src("src/lib/copy.ts"), /ne vous paie pas pour le partage/);
  assert.match(src("src/lib/server/family.ts"), /purgeReferralRows/);
  assert.match(src("src/routes/account.tsx"), /data-ke="refer-friend"|ReferFriendPanel/);
  assert.match(src("src/components/shell.tsx"), /ApplyReferral/);
  assert.doesNotMatch(src("src/routes/login.tsx"), /referral/);
  assert.doesNotMatch(src("src/routes/fr.signup.tsx"), /referral/);
});
