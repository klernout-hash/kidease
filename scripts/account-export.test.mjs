import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACCOUNT_EXPORT_HOURLY_MAX,
  PRIVACY_OFFICER_EMAIL,
  PRIVACY_REQUEST_HOURLY_MAX,
  buildAccountExport,
  hourlyAllowance,
  keepOwn,
  toCsv,
} from "../src/lib/account-export.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { PRIVACY_ADD_EN, PRIVACY_ADD_FR } from "../src/lib/legal-copy-v2.ts";

test("export and privacy requests are rate limited", () => {
  assert.equal(hourlyAllowance(0, ACCOUNT_EXPORT_HOURLY_MAX).ok, true);
  assert.equal(hourlyAllowance(2, ACCOUNT_EXPORT_HOURLY_MAX).ok, true);
  assert.equal(hourlyAllowance(3, ACCOUNT_EXPORT_HOURLY_MAX).ok, false);
  assert.equal(hourlyAllowance(5, PRIVACY_REQUEST_HOURLY_MAX).ok, false);
  assert.equal(hourlyAllowance(Number.NaN, 3).ok, false);
});

test("a file keeps only the signed-in account", () => {
  assert.deepEqual(
    keepOwn(
      [
        { userId: "me", id: "a" },
        { userId: "other", id: "b" },
      ],
      "me",
    ).map((row) => row.id),
    ["a"],
  );
  const built = buildAccountExport({
    exportedAt: "2026-11-21T00:00:00.000Z",
    userId: "me",
    profile: {
      name: "Ada",
      email: "ada@example.com",
      emailVerified: true,
      role: "parent",
      locale: "en",
      phone: null,
      city: "Winnipeg",
      displayName: null,
      bio: null,
      timeZone: "America/Winnipeg",
      homeLabel: null,
      workLabel: null,
      homeLat: null,
      homeLng: null,
      workLat: null,
      workLng: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    children: [
      { userId: "me", id: "c1", name: "Sam", birthdate: "2022-01-01", notes: null, createdAt: null },
      { userId: "other", id: "c2", name: "Hidden", birthdate: "2021-01-01", notes: "secret", createdAt: null },
    ],
    enrolments: [],
    messages: [
      { userId: "me", id: "m1", channel: "centre", conversationId: "t1", daycareId: "d1", body: "=cmd", createdAt: null },
      { userId: "other", id: "m2", channel: "centre", conversationId: "t2", daycareId: "d2", body: "nope", createdAt: null },
    ],
    invoices: [],
    consents: [],
    privacyRequests: [
      { userId: "me", id: "pr-1", kind: "access", note: "please", createdAt: null },
    ],
  });
  const children = built.document.children;
  assert.equal(Array.isArray(children) && children.length, 1);
  assert.equal(children[0].id, "c1");
  assert.equal("userId" in children[0], false);
  assert.equal(built.document.messagesSent.length, 1);
  assert.equal(built.document.messagesSent[0].body, "=cmd");
  assert.match(built.csv.messages, /'=cmd/);
  assert.doesNotMatch(built.csv.messages, /nope/);
  assert.equal(built.document.privacyRequests[0].routedTo, PRIVACY_OFFICER_EMAIL);
  assert.equal(JSON.stringify(built.document).includes("secret"), false);
});

test("csv quotes commas and the privacy tool stays off", () => {
  assert.equal(toCsv(["name"], [["Ada, Parent"]]), 'name\n"Ada, Parent"\n');
  assert.equal(FLAG_DEFAULTS.FEATURE_PRIVACY_REQUESTS, false);
  const en = JSON.stringify(PRIVACY_ADD_EN);
  const fr = JSON.stringify(PRIVACY_ADD_FR);
  assert.match(en, /Account > Export/);
  assert.match(fr, /Compte > Exporter/);
  assert.match(en, /does not send an email/);
  assert.match(fr, /n’envoie pas de courriel/);
  assert.doesNotMatch(en, /free forever/i);
});
