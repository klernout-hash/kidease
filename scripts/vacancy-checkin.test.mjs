import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { vacancyCheckinLabel, vacancyCheckinWrite } from "../src/lib/vacancy-checkin.ts";
import { signVacancyCheckinToken, verifyVacancyCheckinToken } from "../src/lib/vacancy-checkin-token.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("one tap stores 0, 1, 2, or 3 or more and only 0 clears age counts", () => {
  assert.equal(vacancyCheckinLabel(0), "0");
  assert.equal(vacancyCheckinLabel(3), "3+");
  assert.equal(vacancyCheckinWrite(0).clearAgeSpots, true);
  assert.equal(vacancyCheckinWrite(2).clearAgeSpots, false);
  assert.equal(vacancyCheckinWrite(2).spots, 2);
  assert.equal(vacancyCheckinWrite(3).plus, true);
  const sql = readFileSync(join(root, "migrations/0092_vacancy_checkin.sql"), "utf8");
  assert.match(sql, /open_spots_confirmed/);
  assert.doesNotMatch(sql, /fee|price|amount/i);
});

test("signed link verifies and an expired link does not", () => {
  const now = Date.parse("2026-10-03T12:00:00.000Z");
  const token = signVacancyCheckinToken("d_123", "test-secret", now);
  assert.ok(token);
  const payload = verifyVacancyCheckinToken(token, "test-secret", now + 1000);
  assert.equal(payload?.daycareId, "d_123");
  assert.equal(verifyVacancyCheckinToken(token, "other-secret", now + 1000), null);
  assert.equal(verifyVacancyCheckinToken(token, "test-secret", now + 9 * 24 * 60 * 60 * 1000), null);
  assert.equal(signVacancyCheckinToken("d_123", ""), null);
});

test("weekly check-in mail and SMS stay off", () => {
  const flags = readFileSync(join(root, "src/lib/flags.ts"), "utf8");
  assert.match(flags, /FEATURE_VACANCY_CHECKIN: false/);
  assert.match(flags, /FEATURE_VACANCY_CHECKIN_SMS: false/);
  const server = readFileSync(join(root, "src/lib/server/vacancy-checkin.ts"), "utf8");
  const gate = server.indexOf('if (!vacancyCheckinEnabled()) return { ok: true, sent: 0, reason: "flag_off" }');
  const mail = server.indexOf("sendTransactionalMail");
  assert.ok(gate >= 0);
  assert.ok(mail > gate);
  assert.match(server, /toll_free_not_approved/);
  assert.doesNotMatch(server, /sendSms\(/);
  assert.doesNotMatch(server, /from "twilio"|from 'twilio'/);
});
