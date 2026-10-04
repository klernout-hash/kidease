import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeReviewText, reviewFraudReasons, scoreClaimMatch } from "../src/lib/fraud-checks.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const now = Date.parse("2026-10-03T15:00:00Z");

test("claim score uses email or phone against the licence record and never auto-approves", () => {
  const exact = scoreClaimMatch({
    claimantEmail: "Director@SunnySide.ca",
    licenceEmail: "director@sunnyside.ca",
  });
  assert.ok(exact.score >= 70);
  assert.equal(exact.needsReview, false);
  assert.equal(exact.autoApprove, false);

  const domain = scoreClaimMatch({
    claimantEmail: "owner@sunnyside.ca",
    licenceEmail: "director@sunnyside.ca",
  });
  assert.ok(domain.reasons.includes("email_domain"));
  assert.equal(domain.needsReview, false);

  const gmail = scoreClaimMatch({
    claimantEmail: "parent@gmail.com",
    licenceEmail: "centre@gmail.com",
  });
  assert.equal(gmail.score, 0);
  assert.equal(gmail.needsReview, true);
  assert.equal(gmail.autoApprove, false);

  const sameGmail = scoreClaimMatch({
    claimantEmail: "centre@gmail.com",
    licenceEmail: "centre@gmail.com",
  });
  assert.equal(sameGmail.needsReview, false);

  const phone = scoreClaimMatch({
    claimantPhone: "(204) 555-0199",
    licencePhone: "2045550199",
  });
  assert.ok(phone.reasons.includes("phone"));
  assert.equal(phone.needsReview, false);

  const none = scoreClaimMatch({});
  assert.equal(none.score, 0);
  assert.equal(none.needsReview, true);
  assert.equal(none.autoApprove, false);
});

test("reviews flag bursts, non-enrolled parents, and duplicate text", () => {
  assert.equal(normalizeReviewText("Très  bien!!!"), "tres bien");
  const body = "The educators knew my child's name.";
  const recent = [
    { body, ipHash: "ip1", deviceId: "dev1", atMs: now - 60_000 },
    { body: "Another note about pickup.", ipHash: "ip1", deviceId: "dev1", atMs: now - 120_000 },
  ];
  const burst = reviewFraudReasons({
    enrolled: true,
    body,
    ipHash: "ip1",
    deviceId: "dev1",
    nowMs: now,
    recent,
  });
  assert.ok(burst.includes("ip_burst"));
  assert.ok(burst.includes("device_burst"));
  assert.ok(burst.includes("duplicate_text"));

  const quiet = reviewFraudReasons({
    enrolled: true,
    body: "A different sentence about snacks.",
    ipHash: "ip2",
    deviceId: null,
    nowMs: now,
    recent: [],
  });
  assert.deepEqual(quiet, []);

  const outsider = reviewFraudReasons({
    enrolled: false,
    body: "A different sentence about snacks.",
    ipHash: null,
    deviceId: null,
    nowMs: now,
    recent: [],
  });
  assert.deepEqual(outsider, ["not_enrolled"]);
});

test("low claim scores are queued and claims stay unapproved", () => {
  const claims = readFileSync(join(root, "src/lib/server/claims.ts"), "utf8");
  const verify = claims.slice(claims.indexOf("export const verifyClaim"));
  assert.match(verify, /queueClaimReview/);
  assert.match(verify, /claim_status = 'waiting'/);
  assert.doesNotMatch(verify, /claim_status = 'approved'|status = 'approved'/);
  const reviews = readFileSync(join(root, "src/lib/server/reviews.ts"), "utf8");
  assert.match(reviews, /flagReviewAttempt/);
  assert.match(reviews, /status: "pending"/);
  const page = readFileSync(join(root, "src/routes/admin-spam.tsx"), "utf8");
  assert.match(page, /data-ke="fraud-review"/);
  assert.match(page, /notice=/);
  const frame = readFileSync(join(root, "src/components/admin-tool-frame.tsx"), "utf8");
  assert.match(frame, /notice/);
  const queue = readFileSync(join(root, "src/lib/server/fraud-queue.ts"), "utf8");
  assert.doesNotMatch(queue, /create table/i);
  const migration = readFileSync(join(root, "migrations/0080_fraud_flags.sql"), "utf8");
  assert.match(migration, /create table if not exists fraud_flags/);
  assert.match(migration, /create table if not exists review_signals/);
});
