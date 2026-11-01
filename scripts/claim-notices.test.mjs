import assert from "node:assert/strict";
import { test } from "node:test";
import { claimGovMaySee, claimNoticePlan, claimNoticesEnabled, claimNoticesMode } from "../src/lib/wiring/claim-notices.ts";
import { planServiceNotice } from "../src/lib/wiring/common.ts";

test("claim notices cover approve and decline for that province", () => {
  assert.equal(claimNoticesEnabled({}), false);
  assert.equal(claimNoticesMode({ FEATURE_CLAIM_NOTICES: "1" }), "dry_run");
  assert.equal(claimNoticePlan("waiting").notify, false);
  assert.equal(claimNoticePlan("approve").notify, true);
  assert.equal(claimGovMaySee("QC", "ON"), false);
  assert.equal(claimGovMaySee("QC", "QC"), true);
  const sms = planServiceNotice({
    mode: "live",
    email: false,
    sms: true,
    push: true,
    featureSms: false,
    smsConsent: true,
    addressBlocked: false,
    quiet: false,
    featurePush: false,
    pushPref: true,
  });
  assert.equal(sms.channels.includes("sms"), false);
  assert.equal(sms.pushSkipped, "push_off");
});
