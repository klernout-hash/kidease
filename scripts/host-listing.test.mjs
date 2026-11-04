import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { hostListingEnabled } from "../src/lib/features.ts";
import {
  addIsoDays,
  centreDateISO,
  easterSunday,
  holidayOn,
  isIsoDate,
  monthGrid,
  patchAvailabilityMonth,
  publicSpotsFromCalendar,
  shiftMonth,
  spotTotal,
} from "../src/lib/host-calendar.ts";
import { CENTRE_SECTIONS, GUIDE_SECTIONS, parentPartFor, sectionSummary } from "../src/lib/host-listing.ts";
import { visibleDeskNav } from "../src/lib/desk-nav.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("host listing flag stays off", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_HOST_LISTING, false);
  assert.equal(hostListingEnabled({}), false);
  assert.equal(hostListingEnabled({ FEATURE_HOST_LISTING: "0" }), false);
  assert.equal(hostListingEnabled({ FEATURE_HOST_LISTING: "1" }), true);
  assert.match(src(".env.example"), /^FEATURE_HOST_LISTING=0$/m);
  assert.match(src("docs/flags.md"), /FEATURE_HOST_LISTING/);
  assert.equal(visibleDeskNav("daycare").some((item) => item.id === "calendar"), false);
  assert.equal(visibleDeskNav("daycare", { hostListing: true }).some((item) => item.id === "calendar"), true);
  assert.equal(visibleDeskNav("daycare", { hostListing: true }).some((item) => item.id === "tours"), false);
});

test("centre today does not use a UTC date slice", () => {
  const instant = new Date("2026-07-04T06:30:00.000Z");
  assert.equal(centreDateISO("America/Winnipeg", instant), "2026-07-04");
  assert.equal(centreDateISO("America/Vancouver", instant), "2026-07-03");
  assert.equal(centreDateISO("not-a-zone", instant), centreDateISO("America/Winnipeg", instant));
  assert.equal(monthGrid("2026-11").filter((cell) => cell.inMonth).length, 30);
  assert.equal(monthGrid("2026-11")[0].date, "2026-11-01");
  assert.equal(monthGrid("2026-12")[0].inMonth, false);
  assert.equal(monthGrid("2026-12")[2].date, "2026-12-01");
  assert.equal(monthGrid("2026-11").length % 7, 0);
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(isIsoDate("2026-02-31"), false);
  assert.equal(isIsoDate("2026-02-28"), true);
});

test("holidays are labels, and a closed day is zero spots", () => {
  assert.equal(easterSunday(2026), "2026-04-05");
  assert.equal(addIsoDays("2026-04-05", -2), "2026-04-03");
  assert.equal(holidayOn("2026-04-03", "ON")?.en, "Good Friday");
  assert.equal(holidayOn("2026-07-01", "QC")?.fr, "Fête du Canada");
  assert.equal(holidayOn("2026-09-07", "BC")?.en, "Labour Day");
  assert.equal(holidayOn("2026-02-16", "ON")?.en, "Family Day");
  assert.equal(holidayOn("2026-02-16", "QC"), null);
  assert.equal(holidayOn("2026-12-26", "ON")?.en, "Boxing Day");
  assert.equal(holidayOn("2026-12-26", "QC"), null);
  assert.equal(holidayOn("2026-11-04", "MB"), null);
  const closed = publicSpotsFromCalendar(
    { day: "2026-11-04", infant: 2, toddler: 1, preschool: 0, closed: true },
    "2026-11-04T15:00:00.000Z",
  );
  assert.equal(spotTotal(closed, true), 0);
  assert.deepEqual(
    patchAvailabilityMonth([{ month: "2026-10", infant: 1, toddler: 0, preschool: 0 }], "2026-11", closed),
    [
      { month: "2026-10", infant: 1, toddler: 0, preschool: 0 },
      { month: "2026-11", infant: 0, toddler: 0, preschool: 0 },
    ],
  );
  assert.equal(publicSpotsFromCalendar(null, null), null);
});

test("editor pages keep one set of spot fields and the old desk stays in source", () => {
  assert.deepEqual(CENTRE_SECTIONS, [
    "photos",
    "name",
    "location",
    "ages",
    "fees",
    "programs",
    "languages",
    "meals",
    "amenities",
    "safety",
    "policies",
    "french",
    "promo",
    "values",
    "health",
  ]);
  assert.deepEqual(GUIDE_SECTIONS, ["dropoff", "bring", "handbook", "contact"]);
  assert.equal(parentPartFor("ages"), "skip");
  assert.equal(parentPartFor("programs"), "programs");
  assert.equal(parentPartFor("fees"), "financial");
  const summary = sectionSummary(
    "ages",
    { name: "Harbour", spotsInfant: 1, spotsToddler: 0, spotsPreschool: 2, photos: [] },
    "en",
  );
  assert.equal(summary, "3 spots");
  assert.doesNotMatch(summary, /Infant spots/);
  const today = src("src/components/host-today-home.tsx");
  assert.equal(today.split('data-ke="host-confirm-spots"').length - 1, 1);
  assert.equal(today.split("vacancyRefresh").length - 1, 1);
  assert.doesNotMatch(today, /listingHealthTitle|CapacityForm|analytics90/);
  assert.match(today, /WaitlistPulseButton/);
  const editor = src("src/components/host-listing-desk.tsx");
  assert.match(editor, /CENTRE_SECTIONS/);
  assert.match(editor, /GUIDE_SECTIONS/);
  assert.match(editor, /ChevronLeft/);
  assert.doesNotMatch(editor, /vacancyRefresh/);
  const calendar = src("src/components/host-calendar-desk.tsx");
  assert.match(calendar, /monthGrid/);
  assert.match(calendar, /saveHostCalendarDay/);
  assert.match(calendar, /host-notify-offer/);
  assert.doesNotMatch(calendar, /toISOString\(\)\.slice\(0, 10\)/);
  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /hostListing &&/);
  assert.match(provider, /HostTodayHome/);
  assert.match(provider, /!hostListing && deskListings/);
  assert.match(provider, /VacancyConfirmLoop/);
  const server = src("src/lib/server/host-calendar.ts");
  assert.match(server, /last_vacancy_updated_at = now\(\)/);
  assert.match(server, /insert into availability/);
  assert.match(server, /hostListingEnabled\(\)/);
  assert.doesNotMatch(src("src/lib/server/host-calendar.ts") + src("src/components/host-calendar-desk.tsx"), /crm/i);
});
