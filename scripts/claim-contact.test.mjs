import assert from "node:assert/strict";
import test from "node:test";
import {
  claimCodeDestinationAllowed,
  claimContactPreview,
  claimSendAllowed,
  isClaimQaMailbox,
  makeClaimDigitCode,
  maskClaimEmail,
  maskClaimPhone,
} from "../src/lib/claim-contact.ts";

test("masks phone and email and never returns the full value", () => {
  assert.equal(maskClaimPhone("204-555-1234"), "***-***-1234");
  assert.equal(maskClaimEmail("jane@centre.ca"), "j***@centre.ca");
  const preview = claimContactPreview({ phone: "2045551234", email: "jane@centre.ca" });
  assert.equal(preview.phoneMask, "***-***-1234");
  assert.equal(preview.emailMask, "j***@centre.ca");
  assert.equal(preview.needsLicenceOnly, false);
  assert.equal(JSON.stringify(preview).includes("204555"), false);
  assert.equal(JSON.stringify(preview).includes("jane@"), false);
});

test("no contact on file falls back to licence upload", () => {
  assert.equal(claimContactPreview({ phone: "", email: "" }).needsLicenceOnly, true);
});

test("codes are 6 digits", () => {
  assert.equal(makeClaimDigitCode(() => 42), "000042");
  assert.equal(makeClaimDigitCode(() => 1000000), "000000");
});

test("rate limit allows 5 sends per hour", () => {
  const now = 1_000_000;
  assert.equal(claimSendAllowed(4, now - 1000, now).allowed, true);
  assert.equal(claimSendAllowed(5, now - 1000, now).allowed, false);
  assert.equal(claimSendAllowed(5, now - 2 * 60 * 60 * 1000, now).allowed, true);
});

test("QA sends codes only to QA accounts or Kyle", () => {
  assert.equal(isClaimQaMailbox("kyle@kidease.ca"), true);
  assert.equal(isClaimQaMailbox("reviewer.parent@kidease.ca"), true);
  assert.equal(isClaimQaMailbox("qa.daycare@kidease.ca"), true);
  assert.equal(isClaimQaMailbox("support@kidease.ca"), false);
  assert.equal(isClaimQaMailbox("owner@centre.ca"), false);
  assert.equal(
    claimCodeDestinationAllowed({ production: false, channel: "email", destination: "owner@centre.ca" }),
    false,
  );
  assert.equal(
    claimCodeDestinationAllowed({ production: false, channel: "email", destination: "kyle@kidease.ca" }),
    true,
  );
  assert.equal(
    claimCodeDestinationAllowed({ production: false, channel: "sms", destination: "+12045551234" }),
    false,
  );
  assert.equal(
    claimCodeDestinationAllowed({ production: true, channel: "email", destination: "owner@centre.ca" }),
    true,
  );
  assert.equal(
    claimCodeDestinationAllowed({ production: true, channel: "sms", destination: "+12045551234" }),
    true,
  );
});
