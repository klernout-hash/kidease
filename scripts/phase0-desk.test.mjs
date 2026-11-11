import assert from "node:assert/strict";
import { test } from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { familyVaultEnabled, enrolmentEsignEnabled, familyBulkMailEnabled, listCsvEnabled } from "../src/lib/features.ts";
import {
  agreementAfterSign,
  canViewRequestedDocument,
  familyEmailSubject,
  listCsv,
  planDocumentReminder,
  planFamilyEmail,
  planFormShareEmail,
  senderIsKidEase,
} from "../src/lib/phase0-desk.ts";

test("document reminders stay off, skip old requests, and hide files from educators", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_FAMILY_VAULT, false);
  assert.equal(familyVaultEnabled({}), false);
  assert.equal(canViewRequestedDocument("staff"), false);
  assert.equal(canViewRequestedDocument("read_only"), false);
  assert.equal(canViewRequestedDocument(null), false);
  assert.equal(canViewRequestedDocument("owner"), true);
  const base = {
    flagOn: true,
    createdAt: "2026-11-10T15:00:00.000Z",
    enabledAt: "2026-11-01T00:00:00.000Z",
    dueOn: "2026-11-20",
    now: new Date("2026-11-11T18:00:00.000Z"),
    timeZone: "America/Winnipeg",
    received: false,
    sentMilestones: [],
  };
  assert.equal(planDocumentReminder({ ...base, flagOn: false }).reason, "flag_off");
  assert.equal(planDocumentReminder({ ...base, createdAt: "2026-10-01T15:00:00.000Z" }).reason, "pre_enable");
  const first = planDocumentReminder(base);
  assert.equal(first.milestone, "created");
  assert.equal(first.deliver, false);
  assert.equal(planDocumentReminder({ ...base, sentMilestones: ["created"] }).reason, "duplicate");
  const soon = planDocumentReminder({ ...base, now: new Date("2026-11-18T18:00:00.000Z"), sentMilestones: ["created"] });
  assert.equal(soon.milestone, "due_soon");
  const late = planDocumentReminder({
    ...base,
    now: new Date("2026-11-21T18:00:00.000Z"),
    sentMilestones: ["created", "due_soon"],
  });
  assert.equal(late.milestone, "overdue");
});

test("two required guardians are not complete until both have signed", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_ENROLMENT_ESIGN, false);
  assert.equal(enrolmentEsignEnabled({}), false);
  assert.equal(
    agreementAfterSign({
      state: "sent",
      requiredSignerIds: ["g1", "g2"],
      signedSignerIds: ["g1"],
      directorAttestation: false,
    }),
    "partially_signed",
  );
  assert.equal(
    agreementAfterSign({
      state: "partially_signed",
      requiredSignerIds: ["g1", "g2"],
      signedSignerIds: ["g1", "g2"],
      directorAttestation: false,
    }),
    "completed",
  );
  assert.equal(
    agreementAfterSign({
      state: "sent",
      requiredSignerIds: ["g1"],
      signedSignerIds: ["g1"],
      directorAttestation: true,
    }),
    "completed",
  );
  assert.notEqual(
    agreementAfterSign({
      state: "sent",
      requiredSignerIds: ["g1"],
      signedSignerIds: ["g1"],
      directorAttestation: false,
    }),
    "completed",
  );
});

test("five form shares in two minutes become one held note", () => {
  const start = Date.parse("2026-11-11T15:00:00.000Z");
  const shares = [0, 1, 2, 3, 4].map((minute) => ({
    id: `share-${minute}`,
    at: new Date(start + minute * 30 * 1000).toISOString(),
    locale: "fr",
  }));
  const plan = planFormShareEmail({
    flagOn: true,
    shares,
    alreadySentIds: [],
    nowMs: start + 2 * 60 * 1000,
  });
  assert.equal(plan.deliver, false);
  assert.equal(plan.shareIds.length, 5);
  assert.equal(plan.batched, true);
  assert.equal(plan.locale, "fr");
  const again = planFormShareEmail({
    flagOn: true,
    shares,
    alreadySentIds: plan.shareIds,
    nowMs: start + 3 * 60 * 1000,
  });
  assert.equal(again.reason, "duplicate");
});

test("family email stays on kidease.ca and does not send", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_FAMILY_BULK_MAIL, false);
  assert.equal(familyBulkMailEnabled({}), false);
  assert.equal(senderIsKidEase("kyle@kidease.ca"), true);
  assert.equal(senderIsKidEase("kyle@openroadoutlet.ca"), false);
  const held = planFamilyEmail({
    flagOn: true,
    messageId: "m1",
    sender: "support@kidease.ca",
    locale: "fr",
    alreadySent: false,
    suppressed: "none",
  });
  assert.equal(held.deliver, false);
  assert.equal(held.reason, "held");
  assert.equal(
    planFamilyEmail({
      flagOn: true,
      messageId: "m1",
      sender: "support@kidease.ca",
      locale: "en",
      alreadySent: true,
      suppressed: "none",
    }).reason,
    "duplicate",
  );
  assert.equal(
    planFamilyEmail({
      flagOn: true,
      messageId: "m2",
      sender: "support@kidease.ca",
      locale: "en",
      alreadySent: false,
      suppressed: "bounce",
    }).event,
    "email_bounced",
  );
  const subject = familyEmailSubject("fr", "Érable");
  assert.match(subject, /Érable/);
  assert.match(subject, /fermeture/);
});

test("csv export is off by default, skips health columns, and uses a byte order mark", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_LIST_CSV, false);
  assert.equal(listCsvEnabled({}), false);
  assert.equal(listCsv({
    flagOn: false,
    list: "families",
    canViewHealth: true,
    columns: ["name"],
    rows: [],
    timeZone: "America/Winnipeg",
    dateColumns: [],
  }).ok, false);
  const file = listCsv({
    flagOn: true,
    list: "families",
    canViewHealth: false,
    columns: ["joined", "immunization", "city"],
    rows: [{ joined: "2026-11-11T18:30:00.000Z", immunization: "secret", city: "Montréal" }],
    timeZone: "America/Winnipeg",
    dateColumns: ["joined"],
  });
  assert.equal(file.ok, true);
  if (!file.ok) return;
  assert.equal(file.body.charCodeAt(0), 0xfeff);
  assert.match(file.body, /joined,city/);
  assert.doesNotMatch(file.body, /immunization/);
  assert.match(file.body, /Montréal/);
  assert.match(file.body, /2026-11-11/);
});
