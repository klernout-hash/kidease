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

test("admin #35: Site tools in the admin System menu opens the tools on the Daycares tab, Kyle only", async () => {
  const { visibleDeskNav } = await import("../src/lib/desk-nav.ts");
  const item = visibleDeskNav("admin").find((row) => row.id === "site-tools");
  assert.ok(item, "site-tools in admin nav");
  assert.equal(item.href, "/admin");
  assert.deepEqual(item.search, { tab: "daycares", stat: "all" });
  assert.match(src("src/lib/desk-nav.ts"), /itemIds: \["site-tools", "activity"/);
  const page = src("src/components/admin-desk-page.tsx");
  assert.match(page, /canUseOperatorTools\(session\?\.email\) \? \(\s+<h2[^>]+data-ke="admin-site-tools"/);
  assert.match(page, /canUseOperatorTools\(session\?\.email\) \? <LocationChecker \/> : null/);
  assert.match(page, /Show QA fixtures/);
});

test("admin #36: claim cards show spam and fraud flags; a failed flag read does not empty the queue", () => {
  const queue = src("src/lib/server/admin-centre-queue.ts");
  assert.match(queue, /from fraud_flags\s+where daycare_id = any\(\$1::text\[\]\)/);
  assert.match(queue, /\.catch\(\(\) => \[\] as \{ daycare_id: string/);
  assert.match(queue, /fraudFlags: fraudByCentre\.get\(r\.daycare_id\) \?\? \[\]/);
  assert.match(src("src/components/admin-review-card.tsx"), /data-ke="admin-claim-fraud"/);
});

test("admin #36: completeness counts expiry and screening; a claim with the basics but neither is Almost, not Needs work", async () => {
  const { profileHealth } = await import("../src/lib/profile-health.ts");
  const base = {
    licenseNumber: "MB-123", licenseStatus: "active", registryMatchState: "matched", licensePhoto: "file",
    photoCount: 5, hasFees: true, hasAges: true, hasHours: true, phone: "204-555-0100", email: "a@b.ca", address: "1 Main St",
  };
  const h = profileHealth({ ...base, licenseExpiry: null, screeningOnFile: false, staffScreeningAttested: false }, new Date("2026-11-25T12:00:00Z"));
  assert.equal(h.band, "almost");
  assert.ok(h.checks.find((c) => c.id === "licence_expiry").state === "missing");
  const full = profileHealth({ ...base, licenseExpiry: "2027-09-30", screeningOnFile: true }, new Date("2026-11-25T12:00:00Z"));
  assert.equal(full.band, "ready");
  const bare = profileHealth({ ...base, photoCount: 0, hasFees: false }, new Date("2026-11-25T12:00:00Z"));
  assert.equal(bare.band, "needs_work");
});
