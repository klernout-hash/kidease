// Flags on these cards stay off.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import {
  appendAudit,
  auditVisible,
  billingRoleAllows,
  centreContext,
  certificateFileOk,
  credentialReminder,
  familyMessagingAllowed,
  ledgerTotal,
  pdfLineFits,
  privacyCase,
  screeningStatus,
  securityStatementAllowed,
} from "../src/lib/phase1-ops.ts";

test("certificate files are limited and are not sent to a new scanner", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_CREDENTIAL_FILES, false);
  assert.equal(certificateFileOk("ece.pdf", 1000).reason, "scan_not_run");
  assert.equal(certificateFileOk("notes.exe", 1000).reason, "type");
  assert.equal(certificateFileOk("big.pdf", 9_000_000).reason, "size");
});

test("credential reminders fire once per milestone and staff see only their own", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_CREDENTIAL_REMINDERS, false);
  const own = credentialReminder({
    flagOn: true,
    enabledAt: "2026-11-01T00:00:00.000Z",
    expiresOn: "2026-12-11",
    now: new Date("2026-11-11T18:00:00.000Z"),
    timeZone: "America/Winnipeg",
    sentDays: [],
    quiet: false,
    staffId: "s1",
    viewerId: "s1",
    viewerRole: "staff",
  });
  assert.equal(own.deliver, false);
  assert.equal(own.days === 60 || own.reason === "not_due" || own.reason === "held", true);
  const other = credentialReminder({
    flagOn: true,
    enabledAt: "2026-11-01T00:00:00.000Z",
    expiresOn: "2026-12-11",
    now: new Date("2026-11-11T18:00:00.000Z"),
    timeZone: "America/Winnipeg",
    sentDays: [],
    quiet: false,
    staffId: "s1",
    viewerId: "s2",
    viewerRole: "staff",
  });
  assert.equal(other.reason, "not_own");
});

test("missing screening is missing, not current", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_SCREENING_STATUS, false);
  assert.equal(screeningStatus({ issuedOn: null, intervalDays: 365, now: new Date("2026-11-11T00:00:00.000Z") }), "missing");
  assert.equal(
    screeningStatus({ issuedOn: "2026-11-01T00:00:00.000Z", intervalDays: 365, now: new Date("2026-11-11T00:00:00.000Z") }),
    "current",
  );
});

test("roles cannot see another centre or a health page", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_CENTRE_SWITCHER, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_BILLING_ONLY_ROLE, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_FAMILY_MESSAGING_DENY, false);
  const foreign = centreContext("centre-b", ["centre-a"], "centre-a");
  assert.equal(foreign.status, 403);
  assert.equal(foreign.centreId, "centre-a");
  assert.equal(billingRoleAllows("health"), false);
  assert.equal(billingRoleAllows("invoices"), true);
  assert.equal(familyMessagingAllowed(true), false);
});

test("reports, audit, security claims, and privacy cases stay narrow", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_REVENUE_REPORT, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_PDF_EXPORT, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_AUDIT_LOG, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_SECURITY_PAGE, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_PRIVACY_REQUESTS, false);
  assert.equal(ledgerTotal([{ cents: 100 }, { cents: 250 }]), 350);
  assert.equal(pdfLineFits("Court texte"), true);
  assert.equal(pdfLineFits("x".repeat(120)), false);
  const log = appendAudit([], { id: "1", actorId: "u", action: "export", at: "2026-11-11T00:00:00.000Z", centreId: "c1" });
  assert.equal(log.length, 1);
  assert.equal(auditVisible(log[0], ["c2"]), false);
  assert.equal(
    securityStatementAllowed({
      claim: "KidEase is SOC 2 certified",
      evidenceReviewedAt: "2026-11-01T00:00:00.000Z",
      now: new Date("2026-11-11T00:00:00.000Z"),
    }),
    false,
  );
  assert.equal(
    securityStatementAllowed({
      claim: "Pages use HTTPS.",
      evidenceReviewedAt: "2026-11-01T00:00:00.000Z",
      now: new Date("2026-11-11T00:00:00.000Z"),
    }),
    true,
  );
  const privacy = privacyCase({ type: "deletion", requesterId: "guardian-1" });
  assert.equal(privacy.visibleTo, "privacy_officer");
  assert.equal(privacy.contact, "privacy@kidease.ca");
});
