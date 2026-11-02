import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { visibleDeskNav } from "../src/lib/desk-nav.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { parentListingFeesVisible } from "../src/lib/public-fees.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("provider plans and public daycare prices stay off until the flag is on", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_PROVIDER_SUBSCRIPTIONS, false);
  assert.equal(parentListingFeesVisible(false), false);
  assert.equal(parentListingFeesVisible(undefined), false);
  assert.equal(parentListingFeesVisible(true), true);
  const off = visibleDeskNav("daycare", {
    centreOwner: true,
    providerSubscriptions: false,
    subscriptionsEnabled: false,
  }).map((item) => item.id);
  assert.equal(off.includes("promote"), false);
  assert.equal(off.includes("subscription"), false);
  const on = visibleDeskNav("daycare", {
    centreOwner: true,
    providerSubscriptions: true,
    subscriptionsEnabled: true,
  }).map((item) => item.id);
  assert.equal(on.includes("promote"), true);
});

test("tour interest opens a real inbox thread and does not reuse the lead id", () => {
  const leads = src("src/lib/server/lead-requests.ts");
  const sheet = src("src/components/request-tour.tsx");
  const tour = src("src/lib/server/tour-calendar.ts");
  assert.match(leads, /kind === "info" \|\| kind === "tour" \|\| kind === "waitlist"/);
  assert.match(leads, /saveParentInAppNotice/);
  assert.match(leads, /conversationId: recorded\.conversationId/);
  assert.match(sheet, /conversationId: saved\.conversationId/);
  assert.doesNotMatch(sheet, /conversationId: saved\.id/);
  assert.match(tour, /resolveActorUserId/);
  const notice = src("src/lib/server/parent-notice.ts");
  assert.doesNotMatch(notice, /FEATURE_NOTIFICATION_CENTRE|sendSms|sendTransactionalMail|FEATURE_PUSH/);
});

test("ask-for-info and message stay available, and waitlist joins a catalogue listing", () => {
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.match(listing, /data-ke="listing-message-cta"/);
  assert.match(listing, /data-ke="listing-sticky-message"/);
  assert.doesNotMatch(listing, /parentActions && live \? \(\s*<ListingMoreItem onClick=\{onMessage\}/);
  const waitlist = src("src/lib/server/spot-offers.ts");
  const join = waitlist.slice(waitlist.indexOf("export const joinDaycareWaitlist"));
  assert.match(join, /upsertDaycare/);
  assert.match(join, /kind: "waitlist"/);
  const info = src("src/components/request-info.tsx");
  assert.match(info, /conversationId=\{threadId/);
});

test("compare and Saved hide dollar amounts unless subscriptions are on", () => {
  const compare = src("src/routes/compare.tsx");
  const saved = src("src/components/parent-shortlist.tsx");
  assert.match(compare, /parentListingFeesVisible/);
  assert.match(compare, /feesOn \?/);
  assert.doesNotMatch(compare, /householdIncome:\s*70000/);
  assert.match(saved, /showFees=\{feesOn\}/);
  assert.match(saved, /fromPrice: 0/);
});
