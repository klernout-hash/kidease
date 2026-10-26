import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { formatInTimeZone } from "../src/lib/family-time.ts";
import { parentDeskTabOrDefault, parentUrlTab } from "../src/lib/parent-tab.ts";
import { canUseOperatorTools } from "../src/lib/operator-tools.ts";
import { guestViewApplies } from "../src/lib/guest-view.ts";
import { isAdminOnlyListing, isPublicListing, staffQueueRows } from "../src/lib/listing-visibility.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("unknown parent tabs fall back to Explore", () => {
  assert.equal(parentUrlTab("saved"), "saved");
  assert.equal(parentUrlTab("not-a-real-tab"), undefined);
  assert.equal(parentUrlTab(""), undefined);
  assert.equal(parentDeskTabOrDefault("saved"), "saved");
  assert.equal(parentDeskTabOrDefault("nope"), "explore");
  assert.match(src("src/routes/parent.tsx"), /parentUrlTab/);
});

test("operator tools are kyle@ only", () => {
  assert.equal(canUseOperatorTools("kyle@kidease.ca"), true);
  assert.equal(canUseOperatorTools("Kyle@KidEase.ca"), true);
  assert.equal(canUseOperatorTools("director@centre.example"), false);
  assert.equal(canUseOperatorTools("support@kidease.ca"), false);
  assert.equal(canUseOperatorTools(null), false);
  const support = src("src/lib/server/support.ts");
  assert.match(support, /searchSupportPeople[\s\S]*requireAdmin/);
  assert.match(support, /logSupportPreview[\s\S]*requireAdmin/);
  assert.match(src("src/lib/server/location-check.ts"), /requireAdmin/);
  assert.match(src("src/lib/server/catalog-health.ts"), /requireAdmin/);
  assert.match(src("src/routes/provider.tsx"), /canUseOperatorTools/);
  assert.match(src("src/routes/provider.tsx"), /data-ke="test-listing-toggle"/);
  assert.match(src("src/components/support-case.tsx"), /data-ke="guest-view"/);
  assert.match(src("src/components/admin-desk-page.tsx"), /data-ke="site-health"/);
  assert.match(src("src/components/admin-desk-page.tsx"), /data-ke="location-checker"/);
  assert.match(src("src/components/admin-desk-page.tsx"), /data-ke="people-search"/);
});

test("QA TEST Daycare Listing is an admin fixture and the queue SQL can load it", () => {
  const row = {
    slug: "qa-test-daycare-listing-zitu",
    name: "QA TEST Daycare Listing",
  };
  assert.equal(isAdminOnlyListing(row), true);
  assert.equal(isPublicListing(row), false);
  assert.equal(staffQueueRows([row], false).length, 0);
  assert.equal(staffQueueRows([row], true)[0]?.slug, row.slug);
  const sql = src("src/lib/server/admin-centres.ts");
  assert.match(sql, /d\.slug ~\* '\^qa\[-_\]'/);
  assert.match(src("src/components/admin-desk-page.tsx"), /c\.slug/);
});

test("GET /api/e2e-seed is a 404 and private pages are noindex", () => {
  const seed = src("src/routes/api/e2e-seed.ts");
  assert.match(seed, /GET: \(\) => new Response\("Not found", \{ status: 404/);
  assert.match(src("src/routes/login.tsx"), /withNoindex/);
  assert.match(src("src/routes/offer.$token.tsx"), /noindex, nofollow/);
  assert.match(src("src/routes/sign.$id.tsx"), /noindex, nofollow/);
  assert.match(src("src/lib/parent-sms-consent.ts"), /withNoindex/);
  assert.match(src("src/routes/verify-2fa.tsx"), /noindex, nofollow/);
  assert.doesNotMatch(src("src/routes/verify.tsx"), /noindex/);
});

test("alert settings stay closed and quiet hours are not labeled Winnipeg time", () => {
  const alerts = src("src/components/alert-push-settings.tsx");
  const parent = src("src/components/parent-desk.tsx");
  assert.match(alerts, /<details/);
  assert.doesNotMatch(alerts, /<details[^>]*\sopen/);
  assert.match(alerts, /data-ke="alert-settings-summary"/);
  assert.match(alerts, /alertSummary/);
  assert.match(alerts, /alertPrefs/);
  assert.match(parent, /AlertPushSettings/);
  assert.doesNotMatch(parent, /text-2xl">\{t\("alertPrefs"\)\}/);
  const push = src("src/lib/alert-push.ts");
  assert.doesNotMatch(push, /Winnipeg time/i);
  assert.match(push, /your time zone/i);
  const copy = src("src/lib/copy.ts");
  assert.doesNotMatch(copy, /in Winnipeg/);
  assert.doesNotMatch(copy, /21 h à Winnipeg/);
  assert.match(copy, /in your time zone/);
  assert.match(copy, /votre fuseau horaire/);
  assert.match(src("src/lib/server/notify.ts"), /formatInTimeZone/);
  assert.doesNotMatch(src("src/lib/server/notify.ts"), /America\/Winnipeg/);
  assert.doesNotMatch(src("src/lib/account-notify.ts"), /America\/Winnipeg/);
  const stamped = formatInTimeZone(new Date("2026-10-06T02:30:00Z"), "America/Toronto");
  assert.match(stamped, /EDT|EST/);
  assert.doesNotThrow(() => formatInTimeZone(new Date(), null));
});

test("guest view is kyle-only and sits beside the admin desk switch", () => {
  assert.equal(
    guestViewApplies({ cookie: "ke_guest_view=1", email: "kyle@kidease.ca", pathname: "/" }),
    true,
  );
  assert.equal(
    guestViewApplies({ cookie: "ke_guest_view=1", email: "kyle@kidease.ca", pathname: "/search" }),
    true,
  );
  assert.equal(
    guestViewApplies({ cookie: "ke_guest_view=1", email: "kyle@kidease.ca", pathname: "/admin" }),
    false,
  );
  assert.equal(
    guestViewApplies({ cookie: "ke_guest_view=1", email: "kyle@kidease.ca", pathname: "/parent" }),
    false,
  );
  assert.equal(
    guestViewApplies({ cookie: "ke_guest_view=1", email: "kyle@kidease.ca", pathname: "/login" }),
    false,
  );
  assert.equal(
    guestViewApplies({ cookie: "ke_guest_view=1", email: "director@centre.example", pathname: "/" }),
    false,
  );
  assert.equal(
    guestViewApplies({ cookie: "other=1", email: "kyle@kidease.ca", pathname: "/" }),
    false,
  );
  const switcher = src("src/components/desk-switcher.tsx");
  assert.match(switcher, /data-ke="admin-guest-view"/);
  assert.match(switcher, /canUseOperatorTools\(session\.email\)/);
  assert.match(src("src/lib/server/role-route.ts"), /guestViewApplies/);
});

test("search does not write a Winnipeg query when location is unknown", () => {
  const search = src("src/routes/search.tsx");
  assert.match(search, /needsPlace/);
  assert.match(search, /originSource === "default"/);
  assert.doesNotMatch(search, /q=Winnipeg/);
  assert.match(src("src/lib/copy.ts"), /canadaSearchTitle/);
  assert.match(src("src/lib/copy.ts"), /Daycares across Canada/);
});
