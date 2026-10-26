import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const family = readFileSync(join(root, "src/lib/server/family.ts"), "utf8");
const copy = readFileSync(join(root, "src/lib/copy.ts"), "utf8");

test("account deletion keeps billing rows and says so", () => {
  const start = family.indexOf("export async function purgeAccountData");
  assert.ok(start > 0);
  const next = family.indexOf("\nexport ", start + 20);
  const body = family.slice(start, next > start ? next : start + 4000);
  assert.doesNotMatch(body, /delete from payments/);
  assert.doesNotMatch(body, /delete from invoices/);
  assert.match(body, /delete from "user"/);
  const schedule = family.slice(family.indexOf("export const deleteAccount"), family.indexOf("export const restoreMyAccount"));
  assert.match(schedule, /deleted_at/);
  assert.doesNotMatch(schedule, /delete from "user"/);
  assert.match(body, /forgetExternalAccounts/);
  assert.match(body, /anonymizeRetainedRecords/);
  assert.doesNotMatch(body, /delete from security_events/);
  assert.match(copy, /Invoices and payments: kept because tax law requires them/);
  assert.match(copy, /Factures et paiements : conservés parce que la loi fiscale/);
});
