import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  advanceEnrolment,
  enrolmentHandoffEnabled,
  enrolmentHandoffMode,
  feeCentsForAge,
} from "../src/lib/wiring/enrolment-handoff.ts";
import { planServiceNotice } from "../src/lib/wiring/common.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("enrolment hand-off stays off and does not invent a fee", () => {
  assert.equal(enrolmentHandoffEnabled({}), false);
  assert.equal(enrolmentHandoffMode({}), "off");
  assert.equal(enrolmentHandoffMode({ FEATURE_ENROLMENT_HANDOFF: "1" }), "dry_run");
  assert.equal(enrolmentHandoffMode({ FEATURE_ENROLMENT_HANDOFF: "1", FEATURE_ENROLMENT_HANDOFF_LIVE: "1" }), "live");
  assert.deepEqual(feeCentsForAge({ ageGroup: "infant", infantMonthly: null, toddlerMonthly: 800, preschoolMonthly: 700 }), {
    error: "fee_missing",
  });
  assert.deepEqual(feeCentsForAge({ ageGroup: "toddler", infantMonthly: null, toddlerMonthly: 0, preschoolMonthly: null }), {
    cents: 0,
  });
  const accepted = advanceEnrolment({
    step: null,
    event: "accept",
    offerAccepted: true,
    envelopeSigned: false,
    fee: { error: "fee_missing" },
  });
  assert.equal(accepted.ok && accepted.step, "accepted");
  const signed = advanceEnrolment({
    step: "packet",
    event: "signed",
    offerAccepted: true,
    envelopeSigned: false,
    fee: { cents: 100 },
  });
  assert.equal(signed.ok, false);
  const plan = planServiceNotice({
    mode: "live",
    email: true,
    sms: true,
    push: false,
    featureSms: true,
    smsConsent: false,
    addressBlocked: false,
    quiet: false,
    featurePush: false,
    pushPref: false,
  });
  assert.equal(plan.channels.includes("sms"), false);
  assert.equal(plan.smsSkipped, "no_consent");
  assert.match(readFileSync(join(root, "migrations/0132_enrolment_handoff.sql"), "utf8"), /enrolment_handoffs/);
  assert.match(readFileSync(join(root, "src/components/wiring-desk.tsx"), "utf8"), /data-ke="help"/);
  assert.match(readFileSync(join(root, "src/routes/parent_.enrolment-handoff.tsx"), "utf8"), /WiringDesk/);
});
