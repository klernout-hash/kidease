import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { providerInsightsEnabled } from "../src/lib/features.ts";
import {
  HOST_LISTING_SIBLING_IDS,
  hostListingSiblingIds,
  providerNavSearch,
  visibleDeskGroups,
  visibleDeskNav,
} from "../src/lib/desk-nav.ts";
import { insightsCopy } from "../src/lib/provider-insights-copy.ts";
import {
  anonymousAreaMedians,
  areaAverageHours,
  assembleProviderInsights,
  bucketKeys,
  conversionPercent,
  insightWindow,
  scopeCentreIds,
} from "../src/lib/provider-insights.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const NOW = "2026-11-04T15:00:00.000Z";

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function facts(extra = {}) {
  return {
    range: "7d",
    now: NOW,
    centres: [
      {
        id: "c1",
        name: "Maple Room",
        city: "Winnipeg",
        province: "MB",
        licensedCapacity: null,
        spotsInfant: null,
        spotsToddler: null,
        spotsPreschool: null,
        spotsUpdated: false,
        confirmedOpenSpots: null,
      },
    ],
    views: [],
    saves: [],
    inquiries: [],
    requests: [],
    replyHours: [],
    areaMedians: [],
    waitlist: [],
    enrolledNow: 0,
    enrolments: [],
    vacancy: [],
    tours: [],
    attendance: [],
    checkIns: [],
    ratios: [],
    certs: [],
    reviews: [],
    ...extra,
  };
}

test("FEATURE_PROVIDER_INSIGHTS stays off and does not touch pay flags", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_PROVIDER_INSIGHTS, false);
  assert.equal(FLAG_DEFAULTS.SHOW_PAY_CTAS, false);
  assert.equal(FLAG_DEFAULTS.SUBSCRIPTIONS_ENABLED, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_PROVIDER_SUBSCRIPTIONS, false);
  assert.equal(providerInsightsEnabled({}), false);
  assert.equal(providerInsightsEnabled({ FEATURE_PROVIDER_INSIGHTS: "1" }), true);
  assert.equal(providerInsightsEnabled({ FEATURE_PROVIDER_INSIGHTS: "0" }), false);
  assert.match(src(".env.example"), /^FEATURE_PROVIDER_INSIGHTS=0$/m);
  assert.match(src(".env.example"), /^SHOW_PAY_CTAS=0$/m);
});

test("insights is a sibling of today and listings, hidden until the flag is on", () => {
  assert.deepEqual(hostListingSiblingIds(false), ["today", "listings", "calendar"]);
  assert.deepEqual(hostListingSiblingIds(true), [...HOST_LISTING_SIBLING_IDS]);
  assert.equal(providerNavSearch("insights").desk, "insights");
  const hidden = visibleDeskNav("daycare", { centreOwner: true });
  assert.equal(
    hidden.some((item) => item.id === "insights"),
    false,
  );
  const shown = visibleDeskNav("daycare", { centreOwner: true, providerInsights: true });
  const group = visibleDeskGroups("daycare", shown).find((row) => row.group.id === "desk");
  const ids = group.items.map((item) => item.id);
  assert.ok(ids.indexOf("today") < ids.indexOf("listings"));
  assert.ok(ids.indexOf("listings") < ids.indexOf("insights"));
  assert.equal(ids.includes("calendar"), false);
  assert.equal(shown.find((item) => item.id === "insights")?.search?.desk, "insights");
});

test("a centre id outside the account is refused", () => {
  assert.deepEqual(scopeCentreIds(["a", "b"], "all"), { ok: true, ids: ["a", "b"] });
  assert.deepEqual(scopeCentreIds(["a", "b"], "b"), { ok: true, ids: ["b"] });
  assert.deepEqual(scopeCentreIds(["a"], "other"), { ok: false });
  assert.deepEqual(scopeCentreIds(["a"], ""), { ok: true, ids: ["a"] });
});

test("conversion stays empty when there are no views", () => {
  assert.equal(conversionPercent(0, 3), null);
  assert.equal(conversionPercent(40, 0), 0);
  assert.equal(conversionPercent(40, 3), 7.5);
  const window = insightWindow("7d", new Date(NOW));
  assert.equal(window.startDay, "2026-10-29");
  assert.equal(window.endDay, "2026-11-04");
  assert.equal(bucketKeys("7d", new Date(NOW)).length, 7);
  assert.equal(bucketKeys("12m", new Date(NOW)).length, 12);
});

test("area average is hidden under 5 centres and drops the caller's centres", () => {
  const medians = anonymousAreaMedians(
    [
      { daycareId: "mine", hours: 1 },
      { daycareId: "a", hours: 2 },
      { daycareId: "a", hours: 4 },
      { daycareId: "b", hours: 10 },
    ],
    ["mine"],
  );
  assert.equal(medians.length, 2);
  assert.deepEqual(areaAverageHours(medians), { hours: null, centres: null });
  assert.deepEqual(areaAverageHours([1, 2, 3, 4, 5]), { hours: 3, centres: 5 });
  assert.equal(areaAverageHours([1, 2, 3, 4]).centres, null);
});

test("assemble uses only the rows it is given", () => {
  const empty = assembleProviderInsights(facts());
  assert.equal(empty.listing.empty, true);
  assert.equal(empty.listing.conversion, null);
  assert.equal(empty.response.areaMedianHours, null);
  assert.equal(empty.response.areaCentres, null);
  assert.equal(empty.waitlist.empty, true);
  assert.equal(empty.occupancy.capacity, null);
  assert.equal(empty.occupancy.openByAge, null);
  assert.equal(empty.tours.showRate, null);
  assert.equal(empty.attendance.empty, true);
  assert.equal(empty.staff.empty, true);
  assert.equal(empty.reviews.empty, true);
  assert.equal(empty.reviews.average, null);

  const filled = assembleProviderInsights(
    facts({
      views: [{ day: "2026-11-01", count: 40 }],
      saves: [{ day: "2026-11-01", count: 2 }],
      inquiries: [{ at: "2026-11-02T12:00:00Z" }],
      requests: [
        { at: "2026-11-03T12:00:00Z" },
        { at: "2026-11-03T13:00:00Z" },
        { at: "2026-10-01T00:00:00Z" },
      ],
      replyHours: [2, 6],
      areaMedians: [1, 2, 3, 4, 10],
      waitlist: [
        { age: "infant", joinedAt: "2026-10-25T00:00:00Z" },
        { age: "toddler", joinedAt: "2026-11-01T00:00:00Z" },
        { age: "unknown", joinedAt: "2026-11-01T00:00:00Z" },
      ],
      enrolledNow: 4,
      enrolments: [{ at: "2026-11-02T00:00:00Z" }],
      tours: [
        { status: "pending", at: "2026-11-01T00:00:00Z" },
        { status: "no_show", at: "2026-11-02T00:00:00Z" },
        { status: "enrolled", at: "2026-11-03T00:00:00Z" },
      ],
      attendance: [
        { day: "2026-11-01", status: "scheduled" },
        { day: "2026-11-02", status: "arrived" },
      ],
      checkIns: [{ at: "2026-11-03T08:00:00Z" }],
      ratios: [
        { at: "2026-11-02T08:00:00Z", children: 8, staff: 2 },
        { at: "2026-11-02T09:00:00Z", children: 8, staff: 0 },
      ],
      certs: [
        { staffName: "Ada", level: "ECE", expiresOn: "2026-11-14" },
        { staffName: "Bea", level: "", expiresOn: "2027-08-01" },
      ],
      reviews: [
        { at: "2026-11-01T00:00:00Z", rating: 4 },
        { at: "2026-11-02T00:00:00Z", rating: 5 },
        { at: "2026-11-02T00:00:00Z", rating: 9 },
      ],
    }),
  );
  assert.equal(filled.listing.views, 40);
  assert.equal(filled.listing.saves, 2);
  assert.equal(filled.listing.inquiries, 1);
  assert.equal(filled.listing.requests, 2);
  assert.equal(filled.listing.conversion, 5);
  assert.equal(filled.response.medianHours, 4);
  assert.equal(filled.response.areaMedianHours, 4);
  assert.equal(filled.response.areaCentres, 5);
  assert.equal(filled.response.areaCity, "Winnipeg");
  assert.equal(filled.waitlist.total, 2);
  assert.equal(filled.waitlist.groups.find((group) => group.age === "infant")?.count, 1);
  assert.equal(filled.occupancy.enrolled, 4);
  assert.equal(filled.occupancy.capacity, null);
  assert.equal(filled.occupancy.openTotal, null);
  assert.equal(filled.tours.requested, 3);
  assert.equal(filled.tours.booked, 2);
  assert.equal(filled.tours.showRate, 50);
  assert.equal(filled.tours.enrolRate, 50);
  assert.equal(filled.attendance.records, 1);
  assert.equal(filled.attendance.checkIns, 1);
  assert.equal(filled.attendance.source, "check_in");
  assert.equal(filled.staff.ratioSeries[0]?.value, 4);
  assert.equal(filled.staff.certs.length, 1);
  assert.equal(filled.staff.certs[0]?.staffName, "Ada");
  assert.equal(filled.staff.certsOnFile, true);
  assert.equal(filled.reviews.count, 2);
  assert.equal(filled.reviews.average, 4.5);
});

test("posted zero spots stay zero, and unposted spots stay hidden", () => {
  const posted = assembleProviderInsights(
    facts({
      centres: [
        {
          id: "c1",
          name: "Maple Room",
          city: "Winnipeg",
          province: "MB",
          licensedCapacity: 20,
          spotsInfant: 0,
          spotsToddler: 1,
          spotsPreschool: 2,
          spotsUpdated: true,
          confirmedOpenSpots: null,
        },
      ],
    }),
  );
  assert.equal(posted.occupancy.capacity, 20);
  assert.equal(posted.occupancy.openByAge?.find((row) => row.age === "infant")?.spots, 0);
  assert.equal(posted.occupancy.openTotal, 3);
  assert.equal(posted.occupancy.empty, false);

  const mixed = assembleProviderInsights(
    facts({
      centres: [
        {
          id: "c1",
          name: "Maple Room",
          city: "Winnipeg",
          province: "MB",
          licensedCapacity: 10,
          spotsInfant: null,
          spotsToddler: null,
          spotsPreschool: null,
          spotsUpdated: false,
          confirmedOpenSpots: null,
        },
        {
          id: "c2",
          name: "Oak Room",
          city: "Brandon",
          province: "MB",
          licensedCapacity: null,
          spotsInfant: null,
          spotsToddler: null,
          spotsPreschool: null,
          spotsUpdated: false,
          confirmedOpenSpots: 4,
        },
      ],
      areaMedians: [1, 2, 3, 4, 5],
    }),
  );
  assert.equal(mixed.occupancy.capacity, 10);
  assert.equal(mixed.occupancy.capacityCentres, 1);
  assert.equal(mixed.occupancy.openByAge, null);
  assert.equal(mixed.occupancy.openTotal, 4);
  assert.equal(mixed.response.areaMedianHours, null);
});

test("the loader is scoped to the account and does not return other centres", () => {
  const server = src("src/lib/server/provider-insights.ts");
  assert.match(server, /listAccessibleDaycareIds/);
  assert.match(server, /providerInsightsEnabled/);
  assert.match(server, /not \(d\.id = any\(\$3::text\[\]\)\)/);
  assert.match(server, /anonymousAreaMedians/);
  assert.match(server, /status in \('published', 'approved'\)/);
  assert.doesNotMatch(server, /select[^;]*rating_x10/);
  assert.match(src("src/routes/provider.tsx"), /desk === "insights"/);
  assert.match(src("src/components/provider-insights-desk.tsx"), /data-ke="provider-insights"/);
  assert.equal(insightsCopy("en").title, "Insights");
  assert.equal(insightsCopy("fr").title, "Statistiques");
  assert.match(src("src/lib/copy-fr.ts"), /deskNavInsights: "Statistiques"/);
});
