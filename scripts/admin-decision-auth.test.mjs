import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { adminMayDecideCentre } from "../src/lib/admin-decision-auth.ts";
import { anyReauthProofAllows, isReauthRequiredMessage, reauthMessageOf, signReauthStamp } from "../src/lib/reauth.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("the operator can decide even when the mailbox is not marked verified", () => {
  assert.equal(adminMayDecideCentre({ email: "kyle@kidease.ca", storedRole: "admin" }), true);
  assert.equal(adminMayDecideCentre({ email: " Kyle@KidEase.ca ", storedRole: "admin" }), true);
  assert.equal(adminMayDecideCentre({ email: "kyle@openroadoutlet.ca", storedRole: "admin" }), false);
  assert.equal(adminMayDecideCentre({ email: "kyle@kidease.ca", storedRole: "provider" }), false);
  assert.equal(adminMayDecideCentre({ email: "kyle@kidease.ca", storedRole: "parent" }), false);
  assert.equal(adminMayDecideCentre({ email: null, storedRole: "admin" }), false);
});

test("a stale host reauth cookie does not hide a valid shared cookie", () => {
  const secret = "test-secret";
  const now = 1_700_000_000_000;
  const fresh = signReauthStamp("admin-1", now - 60_000, secret);
  const stale = signReauthStamp("admin-1", now - 30 * 60_000, secret);
  assert.equal(anyReauthProofAllows([stale, fresh], "admin-1", "high", secret, now), true);
  assert.equal(anyReauthProofAllows([stale, null], "admin-1", "high", secret, now), false);
  assert.equal(anyReauthProofAllows([fresh], "other", "high", secret, now), false);
});

test("a missing step-up opens confirm, and a non-admin stays blocked", () => {
  assert.equal(isReauthRequiredMessage(reauthMessageOf(new Error("Confirm it's you to continue."))), true);
  assert.equal(isReauthRequiredMessage(reauthMessageOf({ message: "Confirm it's you to continue." })), true);
  assert.equal(isReauthRequiredMessage(reauthMessageOf(new Error("Not authorized"))), false);
  const centres = src("src/lib/server/admin-centres.ts");
  const dialog = src("src/components/reauth-dialog.tsx");
  assert.match(centres, /requireAdminDecision/);
  assert.match(centres, /assertRecentReauth/);
  assert.match(centres, /adminMayDecideCentre/);
  assert.match(dialog, /ReauthRequiredError/);
  assert.match(dialog, /reauthMessageOf/);
  assert.doesNotMatch(centres, /Cf-Access|cf-access-jwt/i);
});
