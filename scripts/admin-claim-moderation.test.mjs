import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("declined claims keep Approve and hide Waiting/Decline as live actions", () => {
  const ui = readFileSync(join(root, "src/components/admin-review-card.tsx"), "utf8");
  assert.match(ui, /disabled=\{locked \|\| status === "declined"\}/);
  assert.match(ui, /centre\.reviewNote/);
  assert.match(ui, /centre\.reviewedAt/);
  const server = readFileSync(join(root, "src/lib/server/admin-centres.ts"), "utf8");
  assert.match(server, /c\.reviewed_at/);
  assert.match(server, /c\.review_note/);
  assert.doesNotMatch(server, /null::timestamptz as reviewed_at/);
});

test("admin queue shows licence and storefront photos for review", () => {
  const ui = readFileSync(join(root, "src/routes/admin.tsx"), "utf8");
  const card = readFileSync(join(root, "src/components/admin-review-card.tsx"), "utf8");
  assert.match(card, /centre\.licensePhoto/);
  assert.match(card, /centre\.storefrontPhoto/);
  assert.match(ui, /Licence and photo review/);
  assert.match(ui, /needsVerification/);
  const nav = readFileSync(join(root, "src/lib/desk-nav.ts"), "utf8");
  assert.match(nav, /id: "verify"/);
  const server = readFileSync(join(root, "src/lib/server/admin-centres.ts"), "utf8");
  assert.match(server, /license_photo/);
  assert.match(server, /storefrontPhoto/);
});
