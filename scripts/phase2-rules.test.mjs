import assert from "node:assert/strict";
import { test } from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import {
  LEAD_TEMPLATE_LABELS,
  MEDICATION_LABELS,
  PTO_LABELS,
  applyCredit,
  approvedPtoHours,
  customRoleAllows,
  decidePto,
  healthCheckVisible,
  leadTemplateReady,
  leadTemplateSend,
  medicationDoseAllowed,
  medicationReminder,
  nativePushPlan,
  parseLeadCsv,
  cwelccMonthly,
  lateFeeCents,
  milestoneVisible,
  packetComplete,
  paymentReminder,
  pdfFieldsReady,
  renewalNotice,
  renewalStatus,
  reviewIsPublic,
  reviewReplyAllowed,
  siteTransferAllowed,
  splitSharesOk,
  STAFF_MOBILE_COPY,
  staffMessageVisible,
  staffMobileOpen,
  startDateAvailable,
  taxReceiptSend,
  taxReceiptTotal,
  videoSharePlan,
  videoVisible,
} from "../src/lib/phase2-rules.ts";

test("a start date matches only a stored opening", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_START_DATE_SEARCH, false);
  assert.equal(startDateAvailable(null, "2026-12-01"), "unknown");
  assert.equal(startDateAvailable("2026-12-01", "2026-11-01"), "no");
  assert.equal(startDateAvailable("2026-11-01", "2026-12-01"), "yes");
});

test("a lead import skips a nameless row and a template is not sent", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_LEAD_CSV, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_LEAD_TEMPLATES, false);
  const parsed = parseLeadCsv("name,email\nAda,ada@example.com\n,missing@example.com");
  assert.equal(parsed.kept.length, 1);
  assert.equal(parsed.skipped, 1);
  assert.equal(leadTemplateReady({ enSubject: "Hello", frSubject: "" }), false);
  assert.equal(leadTemplateReady({ enSubject: "Hello", frSubject: "Bonjour" }), true);
  assert.equal(leadTemplateSend().deliver, false);
  assert.equal(LEAD_TEMPLATE_LABELS.fr, "Note pour une nouvelle famille");
});

test("a custom role and a staff note stay inside the grant", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_CUSTOM_ROLES, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_STAFF_MESSAGES, false);
  assert.equal(customRoleAllows(["invoices"], "health"), false);
  assert.equal(customRoleAllows(["invoices"], "invoices"), true);
  assert.equal(staffMessageVisible({ viewerRole: "parent", centreIds: ["c1"], messageCentreId: "c1" }), false);
  assert.equal(staffMessageVisible({ viewerRole: "billing", centreIds: ["c1"], messageCentreId: "c1" }), false);
  assert.equal(staffMessageVisible({ viewerRole: "staff", centreIds: ["c1"], messageCentreId: "c2" }), false);
  assert.equal(staffMessageVisible({ viewerRole: "staff", centreIds: ["c1"], messageCentreId: "c1" }), true);
  assert.equal(FLAG_DEFAULTS.FEATURE_NATIVE_PUSH, false);
  assert.equal(nativePushPlan().deliver, false);
});

test("time off, splits, and credits do not charge or self-approve", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_PTO, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_SPLIT_PAYERS, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_ACCOUNT_CREDITS, false);
  assert.equal(decidePto({ actorId: "s1", staffId: "s1", decision: "approve" }), "blocked");
  assert.equal(decidePto({ actorId: "owner", staffId: "s1", decision: "approve" }), "approved");
  assert.equal(approvedPtoHours([{ status: "approved", hours: 8 }, { status: "requested", hours: 4 }]), 8);
  assert.equal(PTO_LABELS.denied.fr, "Refusé");
  assert.equal(splitSharesOk([60, 40]), true);
  assert.equal(splitSharesOk([60, 30]), false);
  assert.equal(splitSharesOk([100]), false);
  assert.deepEqual(applyCredit(2500, 4000), { balanceCents: 0, appliedCents: 2500 });
});

test("medication needs permission, and a transfer stays with one owner", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_MEDICATION_LOG, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_SITE_TRANSFER, false);
  assert.equal(medicationDoseAllowed({ name: "Inhaler", permissionId: null }), false);
  assert.equal(medicationDoseAllowed({ name: "Inhaler", permissionId: "perm-1" }), true);
  assert.equal(medicationReminder().reason, "send_disabled");
  assert.equal(MEDICATION_LABELS.check.fr, "Contrôle de santé");
  assert.equal(healthCheckVisible({ role: "parent", childId: "c1", viewerChildIds: ["c2"] }), false);
  assert.equal(healthCheckVisible({ role: "billing", childId: "c1", viewerChildIds: ["c1"] }), false);
  assert.equal(healthCheckVisible({ role: "staff", childId: "c1", viewerChildIds: ["c1"] }), true);
  assert.equal(siteTransferAllowed({ fromId: "a", toId: "a", ownerCentreIds: ["a"] }), false);
  assert.equal(siteTransferAllowed({ fromId: "a", toId: "b", ownerCentreIds: ["a"] }), false);
  assert.equal(siteTransferAllowed({ fromId: "a", toId: "b", ownerCentreIds: ["a", "b"] }), true);
});

test("reviews, packets, fees, video, milestones, and renewal stay held", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_REVIEW_REPLIES, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_FILLABLE_PDF, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_ADMISSION_PACKET, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_STAFF_MOBILE, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_INVOICE_REMINDERS, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_LATE_FEE, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_TAX_RECEIPTS, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_CWELCC_MATH, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_VIDEO_SHARE, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_MILESTONES, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_CREDENTIAL_RENEWAL, false);
  assert.equal(reviewReplyAllowed({ role: "parent", existingReplies: 0, body: "Thanks" }), "role");
  assert.equal(reviewReplyAllowed({ role: "owner", existingReplies: 1, body: "Thanks" }), "one");
  assert.equal(reviewReplyAllowed({ role: "owner", existingReplies: 0, body: "Thanks" }), "ok");
  assert.equal(reviewIsPublic(false), false);
  assert.equal(pdfFieldsReady([{ value: "", required: true }]), false);
  assert.equal(packetComplete([{ required: true, status: "sent" }]), false);
  assert.equal(packetComplete([{ required: true, status: "submitted" }]), true);
  assert.equal(staffMobileOpen("parent"), false);
  assert.equal(staffMobileOpen("staff"), true);
  assert.equal(STAFF_MOBILE_COPY.fr.includes("bientôt"), true);
  assert.equal(paymentReminder().deliver, false);
  assert.equal(lateFeeCents({ balanceCents: 1000, policy: null }), null);
  assert.equal(lateFeeCents({ balanceCents: 1000, policy: { kind: "percent", amount: 3 } }), 30);
  assert.deepEqual(taxReceiptTotal([{ cents: 500, year: 2026 }, { cents: 100, year: 2025 }], 2026), { count: 1, cents: 500 });
  assert.equal(taxReceiptSend().deliver, false);
  assert.equal(cwelccMonthly({ program: true, officialDailyCents: null, days: 20 }), null);
  assert.equal(cwelccMonthly({ program: true, officialDailyCents: 1000, days: 20 }), 20000);
  assert.equal(videoSharePlan().upload, false);
  assert.equal(videoVisible(["g1"], "g2"), false);
  assert.equal(milestoneVisible({ recorded: false, childId: "c1", viewerChildIds: ["c1"] }), false);
  assert.equal(milestoneVisible({ recorded: true, childId: "c1", viewerChildIds: ["c2"] }), false);
  assert.equal(renewalStatus({ expiresOn: null, now: new Date("2026-11-11T00:00:00.000Z"), leadDays: 30 }), "missing");
  assert.equal(renewalNotice().deliver, false);
});
