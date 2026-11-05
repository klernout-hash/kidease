import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("the paid ranking boost stays off unless sponsored pins are on", () => {
  const score = src("src/lib/proximity.ts");
  assert.match(score, /card\.priority && opts\?\.paidPinBoost === true/);
  const home = src("src/lib/server/daycares.ts");
  assert.match(home, /paidPinBoost: pinsOn/);
  assert.match(home, /sponsoredPinsFirst\(\) \? await overlayPriority/);
});

test("admin SMS has no hardcoded phone", () => {
  const notify = src("src/lib/server/notify.ts");
  const chat = src("src/lib/support-chat.ts");
  assert.doesNotMatch(notify, /\+1\d{10}/);
  assert.doesNotMatch(chat, /\+1\d{10}/);
  assert.match(notify, /admin_sms_unconfigured/);
});

test("government viewers do not get home street addresses", () => {
  const privacy = src("src/lib/server/home-address-privacy.ts");
  assert.match(privacy, /role === "government"/);
  assert.doesNotMatch(privacy, /role === "admin" \|\| role === "government"/);
});

test("mail about a test listing is refused even if the caller forgets the flag", () => {
  assert.match(src("src/lib/transactional-mail.ts"), /aboutTestListing === true/);
});
