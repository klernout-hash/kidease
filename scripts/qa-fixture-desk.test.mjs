import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { isQaPersonAccount } from "../src/lib/account-notify.ts";
import { settleAdminCentresLoad } from "../src/lib/admin-centres-load.ts";
import { dedupeConfirmListings } from "../src/lib/confirm-listings.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("QA people stay out of the default People list", () => {
  assert.equal(isQaPersonAccount({ name: "Test Test", email: "real@family.ca" }), true);
  assert.equal(isQaPersonAccount({ name: "QA TEST Parent", email: "a@b.ca" }), true);
  assert.equal(isQaPersonAccount({ name: "Joan", email: "qa@kidease.ca" }), true);
  assert.equal(isQaPersonAccount({ name: "Joan", email: "joan+test@family.ca" }), true);
  assert.equal(isQaPersonAccount({ name: "Testing Academy", email: "hello@testingacademy.ca" }), false);
  assert.equal(isQaPersonAccount({ name: "Peninsula Montessori", email: "office@peninsula.example" }), false);
  const admin = src("src/components/admin-desk-page.tsx");
  assert.match(admin, /isQaPersonAccount/);
  assert.match(admin, /Show QA accounts/);
  assert.match(admin, /showQaPeople/);
});

test("a hung centre load leaves the skeleton", async () => {
  const hung = await settleAdminCentresLoad(() => new Promise(() => {}), 30);
  assert.equal(hung.ok, false);
  if (!hung.ok) assert.match(hung.error, /Could not load the admin queue/);
  const admin = src("src/components/admin-desk-page.tsx");
  assert.match(admin, /const applyCentres = centresPromise\.then/);
  assert.match(admin, /await applyCentres/);
});

test("screening and listings hide QA fixtures until the toggle", () => {
  const screening = src("src/components/admin-screening.tsx");
  assert.match(screening, /looksLikeTestFixture/);
  assert.match(screening, /Show QA listings/);
  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /isAdminOnlyListing/);
  assert.match(provider, /Show test listings/);
  assert.match(provider, /skipConfirmSpots/);
  const rows = dedupeConfirmListings([
    { id: "a", name: "Peninsula Montessori", city: "Winnipeg" },
    { id: "b", name: "Peninsula Montessori", city: "Winnipeg" },
    { id: "a", name: "Peninsula Montessori", city: "Winnipeg" },
    { id: "c", name: "Peninsula Montessori", city: "Brandon" },
  ]);
  assert.deepEqual(
    rows.map((row) => row.id),
    ["a", "c"],
  );
});

test("test centres cannot send a contract", () => {
  const server = src("src/lib/server/contracts.ts");
  assert.match(server, /Test centres cannot be sent a contract/);
  assert.match(server, /isTest: isAdminOnlyListing/);
  const ui = src("src/components/admin-contracts.tsx");
  assert.match(ui, /!centre\.isTest/);
  assert.match(ui, /Test centre\. Sending is off/);
});
