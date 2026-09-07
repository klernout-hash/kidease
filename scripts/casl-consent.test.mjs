import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  CASL_ADDRESS_BLOCKED_MESSAGE,
  CASL_NO_CONSENT_MESSAGE,
  CASL_STATEMENTS,
  caslStatement,
  decideCaslSend,
  isStartKeyword,
  isStopKeyword,
  normalizeCaslAddress,
  parseInboundOptOut,
  statementKeyFor,
} from "../src/lib/casl.ts";
import { signCaslUnsubToken, verifyCaslUnsubToken } from "../src/lib/casl-token.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("express consent statements exist in EN and FR-CA and are not pre-checked copy", () => {
  for (const key of Object.keys(CASL_STATEMENTS.en)) {
    assert.ok(CASL_STATEMENTS.fr[key]);
    assert.match(CASL_STATEMENTS.en[key], /Optional|not required/i);
    assert.match(CASL_STATEMENTS.fr[key], /Facultatif/);
    assert.match(CASL_STATEMENTS.en[key], /Winnipeg/);
    assert.match(CASL_STATEMENTS.fr[key], /Winnipeg/);
  }
  assert.match(caslStatement("en", "smsService"), /STOP/);
  assert.match(caslStatement("fr", "smsService"), /ARRÊT|STOP/);
  assert.equal(statementKeyFor("sms", "service"), "smsService");
  assert.equal(statementKeyFor("email", "commercial"), "emailCommercial");
});

test("STOP / ARRÊT and START parse from body or OptOutType", () => {
  assert.equal(isStopKeyword("STOP"), true);
  assert.equal(isStopKeyword("arrêt maintenant"), true);
  assert.equal(isStopKeyword("ARRET"), true);
  assert.equal(isStartKeyword("START"), true);
  assert.equal(parseInboundOptOut({ OptOutType: "STOP" }), "stop");
  assert.equal(parseInboundOptOut({ Body: "STOP" }), "stop");
  assert.equal(parseInboundOptOut({ Body: "thanks" }), null);
});

test("normalize CASL addresses and fail-closed send decision", () => {
  assert.equal(normalizeCaslAddress("sms", "204-555-0199"), "+12045550199");
  assert.equal(normalizeCaslAddress("email", "Kyle@KidEase.ca"), "kyle@kidease.ca");
  assert.equal(normalizeCaslAddress("email", "not-an-email"), "");
  assert.deepEqual(decideCaslSend({ userGranted: true, addressBlocked: false }), { ok: true });
  assert.deepEqual(decideCaslSend({ userGranted: false, addressBlocked: false }), {
    ok: false,
    reason: CASL_NO_CONSENT_MESSAGE,
  });
  assert.deepEqual(decideCaslSend({ userGranted: true, addressBlocked: true }), {
    ok: false,
    reason: CASL_ADDRESS_BLOCKED_MESSAGE,
  });
});

test("unsubscribe tokens expire and reject tampering", () => {
  const secret = "test-better-auth-secret-not-real";
  const token = signCaslUnsubToken(
    { userId: "usr_1", channel: "email", purpose: "service", exp: Date.now() + 60_000 },
    secret,
  );
  const ok = verifyCaslUnsubToken(token, secret);
  assert.equal(ok?.userId, "usr_1");
  assert.equal(ok?.channel, "email");
  assert.equal(verifyCaslUnsubToken(token.slice(0, -2) + "xx", secret), null);
  const expired = signCaslUnsubToken(
    { userId: "usr_1", channel: "sms", purpose: "all", exp: Date.now() - 1 },
    secret,
  );
  assert.equal(verifyCaslUnsubToken(expired, secret), null);
});

test("migration stores who/when/what and does not treat a phone as consent", () => {
  const sql = src("migrations/0036_casl_consents.sql");
  assert.match(sql, /create table if not exists casl_consents/);
  assert.match(sql, /casl_consent_events/);
  assert.match(sql, /casl_address_blocks/);
  assert.match(sql, /statement/);
  assert.match(sql, /granted_at/);
  assert.match(sql, /Do not treat a phone or email on profiles as consent/);
  assert.match(sql, /FEATURE_SMS stays off/);
});

test("send paths and UI capture consent without enabling FEATURE_SMS", () => {
  assert.match(src("src/lib/server/sms.ts"), /consentGranted/);
  assert.match(src("src/lib/server/sms.ts"), /audience !== "internal"/);
  assert.match(src("src/lib/server/notify.ts"), /audience: "internal"/);
  assert.match(src("src/lib/server/admin-centres.ts"), /evaluateCaslSend/);
  assert.match(src("src/lib/server/search-alerts.ts"), /evaluateCaslSend/);
  assert.match(src("src/lib/server/search-alerts.ts"), /List-Unsubscribe/);
  assert.match(src("src/routes/account.tsx"), /CaslConsentFields/);
  assert.match(src("src/components/saved-searches-panel.tsx"), /caslSmsLabel/);
  assert.match(src("src/components/parent-plus.tsx"), /checkout_checkbox/);
  assert.match(src("src/routes/pay.bill.$billId.tsx"), /CaslConsentFields/);
  assert.match(src(".env.example"), /^FEATURE_SMS=0$/m);
  assert.doesNotMatch(src(".env.example"), /^FEATURE_SMS=1$/m);
  assert.match(src("src/lib/copy.ts"), /caslLegend: "CASL consent"/);
  assert.match(src("src/lib/copy.ts"), /caslLegend: "Consentement LCAP"/);
});
