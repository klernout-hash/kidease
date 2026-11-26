import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("admin #33: /admin-chat keeps the admin guard and shows a moved screen in production, no redirect", () => {
  const page = src("src/routes/admin-chat.tsx");
  assert.ok(!/redirect\(/.test(page));
  assert.match(page, /await beforeLoadAdminDesk\(\);/);
  assert.match(page, /if \(import\.meta\.env\.PROD\) return <AdminChatMoved \/>;/);
  assert.match(page, /to="\/admin-support"/);
});

test("admin #34: the 2FA gate remembers a verified answer and still re-checks", async () => {
  const gates = src("src/lib/auth/gates.tsx");
  assert.match(gates, /const TWO_FACTOR_CACHE_MS = 10 \* 60 \* 1000;/);
  assert.match(gates, /setState\(twoFactorCachedOk\(userId\) \? "ok" : "load"\);/);
  assert.match(gates, /rememberTwoFactor\(userId, s\.verified === true\);/);
  assert.match(gates, /rememberTwoFactor\(userId, false\);/);
  assert.match(src("src/lib/server/roles.ts"), /ensureProfile\.then\(\(\) => profileRole\(sql, userId\)\),\s+lookupUser\(userId\),/);
});

test("admin #34: the queue pages 25 cards at a time and drops large inline photos", async () => {
  const { pagedSlice, ADMIN_QUEUE_PAGE } = await import("../src/lib/use-paged-list.ts");
  const rows = Array.from({ length: 291 }, (_, i) => i);
  const first = pagedSlice(rows, ADMIN_QUEUE_PAGE);
  assert.equal(first.shown.length, 25);
  assert.equal(first.more, 266);
  assert.equal(pagedSlice(rows, 300).more, 0);
  const queue = src("src/lib/server/admin-centre-queue.ts");
  assert.match(queue, /export const QUEUE_INLINE_PHOTO_MAX = 60_000;/);
  assert.match(queue, /photoThumbs: realPhotos\.filter\(queuePhotoOk\)\.slice\(0, 4\)/);
  assert.match(src("src/components/admin-review-card.tsx"), /statPage\.shown\.map/);
  assert.match(src("src/components/admin-desk-page.tsx"), /verifyPage\.shown\.map/);
});
