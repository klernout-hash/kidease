import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const family = readFileSync(join(root, "src/lib/server/family.ts"), "utf8");
const copy = readFileSync(join(root, "src/lib/copy.ts"), "utf8");

test("account deletion keeps billing rows and says so", () => {
  const start = family.indexOf("export const deleteAccount");
  assert.ok(start > 0);
  const body = family.slice(start, start + 1800);
  assert.doesNotMatch(body, /delete from payments/);
  assert.doesNotMatch(body, /delete from invoices/);
  assert.match(body, /delete from "user"/);
  assert.match(copy, /keep billing records the law requires/i);
  assert.match(copy, /dossiers de facturation exigés par la loi/);
});
