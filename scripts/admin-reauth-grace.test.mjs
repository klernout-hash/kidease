import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ADMIN_REAUTH_GRACE_DEFAULT_MS,
  ADMIN_REAUTH_GRACE_MAX_MS,
  ADMIN_REAUTH_GRACE_MINUTES,
  adminReauthGraceMs,
  parseReauthProof,
  REAUTH_REQUIRED_MESSAGE,
  REAUTH_WINDOW_MINUTES,
  REAUTH_WINDOW_MS,
  reauthProofAllows,
  signReauthCookie,
  signReauthStamp,
  stepUpAllows,
  stepUpClass,
} from "../src/lib/reauth.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const secret = "test-secret";
const now = 1_700_000_000_000;
const minute = 60 * 1000;

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

describe("admin reauth grace", () => {
  it("keeps a 20-minute default and a safe env override", () => {
    assert.equal(ADMIN_REAUTH_GRACE_DEFAULT_MS, 20 * minute);
    assert.equal(ADMIN_REAUTH_GRACE_MINUTES, 20);
    assert.equal(REAUTH_WINDOW_MS, 10 * minute);
    assert.equal(REAUTH_WINDOW_MINUTES, 10);
    assert.equal(adminReauthGraceMs(undefined), ADMIN_REAUTH_GRACE_DEFAULT_MS);
    assert.equal(adminReauthGraceMs(""), ADMIN_REAUTH_GRACE_DEFAULT_MS);
    assert.equal(adminReauthGraceMs("0"), ADMIN_REAUTH_GRACE_DEFAULT_MS);
    assert.equal(adminReauthGraceMs("-5"), ADMIN_REAUTH_GRACE_DEFAULT_MS);
    assert.equal(adminReauthGraceMs("nope"), ADMIN_REAUTH_GRACE_DEFAULT_MS);
    assert.equal(adminReauthGraceMs(String(15 * minute)), 15 * minute);
    assert.equal(adminReauthGraceMs(String(5 * minute)), REAUTH_WINDOW_MS);
    assert.equal(adminReauthGraceMs(String(ADMIN_REAUTH_GRACE_MAX_MS + minute)), ADMIN_REAUTH_GRACE_MAX_MS);
  });

  it("high-stakes still require confirm when grace would cover a desk edit", () => {
    assert.equal(stepUpClass("approve_live"), "high");
    assert.equal(stepUpClass("unlive_decline"), "high");
    assert.equal(stepUpClass("license_document"), "high");
    assert.equal(stepUpClass("license_review"), "high");
    assert.equal(stepUpClass("screening_review"), "high");
    assert.equal(stepUpClass("contract_send"), "high");
    assert.equal(stepUpClass("contract_void"), "high");
    assert.equal(stepUpClass("straighten_photo"), "grace");
    assert.equal(stepUpClass("optional_note"), "grace");
    assert.equal(stepUpClass("non_trust_field"), "grace");

    const confirmedAt = now - 15 * minute;
    assert.equal(
      stepUpAllows({ class: "high", confirmedAtMs: confirmedAt, nowMs: now, graceMs: ADMIN_REAUTH_GRACE_DEFAULT_MS }),
      false,
    );
    assert.equal(stepUpAllows({ class: "high", confirmedAtMs: null, nowMs: now }), false);

    const stamp = signReauthStamp("kyle-1", confirmedAt, secret);
    const proof = parseReauthProof(stamp, secret);
    assert.equal(proof?.kind, "stamp");
    assert.equal(reauthProofAllows(proof, "kyle-1", "high", now, ADMIN_REAUTH_GRACE_DEFAULT_MS), false);
    assert.equal(reauthProofAllows(proof, "other", "grace", now, ADMIN_REAUTH_GRACE_DEFAULT_MS), false);
    assert.equal(parseReauthProof(`${stamp}x`, secret), null);
  });

  it("after confirm, low-risk succeeds without a second confirm inside the grace window", () => {
    const confirmedAt = now - 15 * minute;
    assert.equal(
      stepUpAllows({ class: "grace", confirmedAtMs: confirmedAt, nowMs: now, graceMs: ADMIN_REAUTH_GRACE_DEFAULT_MS }),
      true,
    );
    assert.equal(
      stepUpAllows({
        class: "grace",
        confirmedAtMs: now - REAUTH_WINDOW_MS,
        nowMs: now - 1,
        graceMs: ADMIN_REAUTH_GRACE_DEFAULT_MS,
      }),
      true,
    );
    const fresh = signReauthStamp("kyle-1", now - 2 * minute, secret);
    assert.equal(
      reauthProofAllows(parseReauthProof(fresh, secret), "kyle-1", "grace", now, ADMIN_REAUTH_GRACE_DEFAULT_MS),
      true,
    );
    assert.equal(
      reauthProofAllows(parseReauthProof(fresh, secret), "kyle-1", "high", now, ADMIN_REAUTH_GRACE_DEFAULT_MS),
      true,
    );
  });

  it("after grace expiry, confirm is required again", () => {
    const confirmedAt = now - ADMIN_REAUTH_GRACE_DEFAULT_MS;
    assert.equal(
      stepUpAllows({ class: "grace", confirmedAtMs: confirmedAt, nowMs: now, graceMs: ADMIN_REAUTH_GRACE_DEFAULT_MS }),
      false,
    );
    assert.equal(
      stepUpAllows({
        class: "grace",
        confirmedAtMs: confirmedAt + 1,
        nowMs: now,
        graceMs: ADMIN_REAUTH_GRACE_DEFAULT_MS,
      }),
      true,
    );
    const expired = signReauthStamp("kyle-1", now - 21 * minute, secret);
    assert.equal(
      reauthProofAllows(parseReauthProof(expired, secret), "kyle-1", "grace", now, ADMIN_REAUTH_GRACE_DEFAULT_MS),
      false,
    );
    assert.equal(
      reauthProofAllows(parseReauthProof(expired, secret), "kyle-1", "high", now, ADMIN_REAUTH_GRACE_DEFAULT_MS),
      false,
    );
    assert.equal(
      stepUpAllows({ class: "high", confirmedAtMs: now - REAUTH_WINDOW_MS, nowMs: now }),
      false,
    );
  });

  it("still accepts an unexpired legacy expiry cookie", () => {
    const live = Date.now();
    const legacy = signReauthCookie("kyle-1", live + 5 * minute, secret);
    const proof = parseReauthProof(legacy, secret);
    assert.equal(proof?.kind, "legacy");
    assert.equal(reauthProofAllows(proof, "kyle-1", "high", live), true);
    assert.equal(reauthProofAllows(proof, "kyle-1", "grace", live), true);
    assert.equal(parseReauthProof(signReauthCookie("kyle-1", live - 1, secret), secret), null);
  });

  it("wires high-stakes to the short window and Straighten photo to grace", () => {
    const centres = src("src/lib/server/admin-centres.ts");
    const photos = src("src/lib/server/reprocess-listing-photos.ts");
    const trust = src("src/lib/server/trust.ts");
    const screening = src("src/lib/server/provider-screening.ts");
    const license = src("src/routes/api/license-docs.$daycareId.ts");
    const contracts = src("src/lib/server/contracts.ts");
    const reviews = src("src/lib/server/reviews.ts");
    const server = src("src/lib/server/reauth.server.ts");
    const dialog = src("src/components/reauth-dialog.tsx");

    assert.match(centres, /assertRecentReauth/);
    assert.match(centres, /runApproval/);
    assert.match(contracts, /assertRecentReauth/);
    assert.match(trust, /assertRecentReauth/);
    assert.match(screening, /assertRecentReauth/);
    assert.match(reviews, /assertRecentReauth/);
    assert.match(license, /actor === "admin"/);
    assert.match(license, /assertRecentReauth/);
    assert.match(photos, /assertGraceReauth/);
    assert.doesNotMatch(photos, /assertRecentReauth/);
    assert.match(photos, /Does not change claim status or the Approve → Live gates/);
    assert.match(server, /signReauthStamp/);
    assert.match(server, /ADMIN_REAUTH_GRACE_MS/);
    assert.match(server, /assertGraceReauth/);
    assert.match(dialog, /ADMIN_REAUTH_GRACE_MINUTES/);
    assert.match(dialog, /REAUTH_WINDOW_MINUTES/);
    assert.match(src("src/routes/admin.tsx"), /withReauth/);
    assert.match(src("src/components/admin-screening.tsx"), /withReauth/);
    assert.match(src("src/components/admin-review-card.tsx"), /withReauth/);
    assert.match(src("src/components/admin-reviews.tsx"), /withReauth/);
    assert.match(src("SECURITY.md"), /ADMIN_REAUTH_GRACE_DEFAULT_MS/);
    assert.match(src("docs/listing-photo-polish.md"), /ADMIN_REAUTH_GRACE_DEFAULT_MS/);
    assert.doesNotMatch(src("src/lib/approve-live.ts"), /reauth|REAUTH/);
    assert.equal(REAUTH_REQUIRED_MESSAGE, "Confirm it's you to continue.");
  });
});
