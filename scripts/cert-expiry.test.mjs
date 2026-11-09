import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { certExpiryDue, certExpirySend } from "../src/lib/cert-expiry.ts";
import { planUnifiedScan } from "../src/lib/unified-alert-scan.ts";
import { decideUnifiedAlert } from "../src/lib/unified-alerts.ts";

const now = new Date("2026-11-09T15:00:00.000Z");

test("only upcoming certificates in the next 60 days qualify", () => {
  assert.equal(certExpiryDue("2026-12-01", now), true);
  assert.equal(certExpiryDue("2026-11-08", now), false);
  assert.equal(certExpiryDue("2026-11-01", now), false);
  assert.equal(certExpiryDue("2027-02-01", now), false);
  assert.equal(certExpirySend(), "off");
});

test("the scanner waits for consent and does not replay an old certificate", () => {
  const base = {
    id: "c1",
    daycareId: "d1",
    name: "Oaks",
    expiresOn: "2026-12-01",
    userIds: ["owner"],
  };
  assert.equal(
    planUnifiedScan({ now, certs: [{ ...base, consent: false }] }).some((row) => row.typeId === "staff_cert_expiring"),
    false,
  );
  assert.equal(
    planUnifiedScan({ now, certs: [{ ...base, expiresOn: "2026-11-01", consent: true }] }).some(
      (row) => row.typeId === "staff_cert_expiring",
    ),
    false,
  );
  assert.equal(
    planUnifiedScan({ now, certs: [{ ...base, consent: true }] }).some((row) => row.typeId === "staff_cert_expiring"),
    true,
  );
});

test("a certificate alert is not emailed or pushed", () => {
  const decision = decideUnifiedAlert({
    typeId: "staff_cert_expiring",
    settings: {
      master: true,
      inApp: true,
      email: true,
      push: true,
      digest: "off",
      quietStart: "21:00",
      quietEnd: "08:00",
      timeZone: "UTC",
      quietCustom: true,
    },
    typeEnabled: true,
    flagOn: true,
    live: true,
    pushArmed: true,
    previewOrTest: false,
    blocked: false,
  });
  assert.equal(decision.outbound, "none");
  assert.equal(decision.channels.includes("email"), false);
  const source = readFileSync(new URL("../src/lib/cert-expiry.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /fetch\(|sendMail|sendSms/);
});
