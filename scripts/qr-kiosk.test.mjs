import assert from "node:assert/strict";
import { test } from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { qrKioskEnabled } from "../src/lib/features.ts";
import {
  kioskReady,
  kioskRedeemDecision,
  kioskScanUrl,
  mintKioskToken,
  readKioskHash,
  verifyKioskToken,
  KIOSK_ROTATE_MS,
} from "../src/lib/qr-kiosk.ts";

const secret = "test-kiosk-secret-not-real";
const now = Date.parse("2026-10-31T15:00:00.000Z");

test("FEATURE_QR_KIOSK defaults off and will not mint without a secret", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_QR_KIOSK, false);
  assert.equal(qrKioskEnabled({}), false);
  assert.deepEqual(kioskReady({}), { enabled: false, canMint: false });
  assert.deepEqual(kioskReady({ FEATURE_QR_KIOSK: "1" }), { enabled: true, canMint: false });
  assert.equal(mintKioskToken({ daycareId: "dc1", secret, enabled: false }), null);
  assert.equal(mintKioskToken({ daycareId: "dc1", secret: "", enabled: true }), null);
});

test("a code rotates and the previous window still scans", () => {
  const minted = mintKioskToken({ daycareId: "dc 1", secret, now, enabled: true });
  assert.ok(minted);
  assert.equal(verifyKioskToken(minted.token, secret, now)?.daycareId, "dc 1");
  assert.equal(verifyKioskToken(minted.token, secret, now + KIOSK_ROTATE_MS)?.daycareId, "dc 1");
  assert.equal(verifyKioskToken(minted.token, secret, now + KIOSK_ROTATE_MS * 2), null);
  assert.equal(verifyKioskToken(minted.token, "other-secret", now), null);
  const next = mintKioskToken({ daycareId: "dc 1", secret, now: now + KIOSK_ROTATE_MS, enabled: true });
  assert.notEqual(next?.token, minted.token);
  const url = kioskScanUrl("https://www.kidease.ca/", minted.token);
  assert.match(url, /^https:\/\/www\.kidease\.ca\/parent\/daily-feed#kiosk=/);
  assert.equal(readKioskHash(new URL(url).hash), minted.token);
  assert.doesNotMatch(url, /google/i);
});

test("redeem only for an enrolled child and only once per code", () => {
  assert.deepEqual(
    kioskRedeemDecision({ enabled: false, verified: true, enrolled: true, action: "check_in", alreadyUsed: false }),
    { ok: false, reason: "off" },
  );
  assert.deepEqual(
    kioskRedeemDecision({ enabled: true, verified: false, enrolled: true, action: "check_in", alreadyUsed: false }),
    { ok: false, reason: "bad_code" },
  );
  assert.deepEqual(
    kioskRedeemDecision({ enabled: true, verified: true, enrolled: false, action: "check_out", alreadyUsed: false }),
    { ok: false, reason: "not_enrolled" },
  );
  assert.deepEqual(
    kioskRedeemDecision({ enabled: true, verified: true, enrolled: true, action: "check_in", alreadyUsed: true }),
    { ok: false, reason: "already" },
  );
  assert.deepEqual(
    kioskRedeemDecision({ enabled: true, verified: true, enrolled: true, action: "check_out", alreadyUsed: false }),
    { ok: true, status: "departed" },
  );
});
