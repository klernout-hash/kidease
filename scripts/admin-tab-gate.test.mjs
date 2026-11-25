import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const gates = readFileSync(join(root, "src/lib/auth/gates.tsx"), "utf8");

test("admin tab switches do not re-run the 2FA gate (no 'Checking admin access…' per tab)", () => {
  // The admin desk passes next=/admin?tab=… — every staff path collapses to one gate key.
  assert.match(gates, /const gateNext = staff \? "\/admin" : next;/);
  assert.match(gates, /\}, \[user\?\.id, gateNext\]\);/);
  assert.doesNotMatch(gates, /\}, \[user\?\.id, next\]\);/);
  // Still fails closed and still uses the shared rule.
  assert.match(gates, /setState\(twoFactorGateState\(false, gateNext\)\)/);
  assert.match(gates, /setState\(twoFactorGateState\(s\.verified, gateNext\)\)/);
});

test("admin Mail never calls a failed Titan load an empty inbox", () => {
  const mail = readFileSync(join(root, "src/components/admin-mail.tsx"), "utf8");
  assert.match(mail, /status\?\.titanLinked && !inboxError \? "This Titan inbox is empty\." : "Open Titan webmail to read this mailbox\."/);
});

test("Outbound safety (test mode) is in the admin System menu", async () => {
  const { DESK_GROUPS } = await import("../src/lib/desk-nav.ts");
  const system = DESK_GROUPS.admin.find((g) => g.id === "system");
  assert.ok(system.itemIds.includes("outbound"));
});
