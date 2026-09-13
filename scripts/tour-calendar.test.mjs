import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CANADA_TOUR_TIMEZONES,
  DEFAULT_TOUR_TIMEZONE,
  clampTourCapacity,
  expandWeeklyRepeats,
  formatTourSlotRange,
  isTourWindowBookable,
  normalizeTourWindow,
  publicSlotsOpen,
  remainingTourSeats,
  resolveTourTimezone,
  toPublicTourSlot,
  tourEmptyReason,
  zonedLocalToUtc,
} from "../src/lib/tour-calendar.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("timezone defaults to America/Winnipeg and accepts a centre override", () => {
  assert.equal(DEFAULT_TOUR_TIMEZONE, "America/Winnipeg");
  assert.equal(resolveTourTimezone(null), "America/Winnipeg");
  assert.equal(resolveTourTimezone("not-a-zone"), "America/Winnipeg");
  assert.equal(resolveTourTimezone("America/Vancouver"), "America/Vancouver");
  assert.ok(CANADA_TOUR_TIMEZONES.includes("America/Winnipeg"));
});

test("Winnipeg local tour times convert to the real UTC instant", () => {
  const winter = zonedLocalToUtc("2026-01-15", "10:00", "America/Winnipeg");
  const summer = zonedLocalToUtc("2026-07-15", "10:00", "America/Winnipeg");
  assert.equal(winter?.toISOString(), "2026-01-15T16:00:00.000Z");
  assert.equal(summer?.toISOString(), "2026-07-15T15:00:00.000Z");
});

test("windows reject junk, clamp capacity, and expand weekly repeats", () => {
  assert.equal(normalizeTourWindow({ date: "2026-09-16", startTime: "10:00", endTime: "09:00" }), null);
  assert.deepEqual(normalizeTourWindow({ date: "2026-09-16", startTime: "10:00", endTime: "10:30", capacity: 99 }), {
    date: "2026-09-16",
    startTime: "10:00",
    endTime: "10:30",
    capacity: 12,
  });
  assert.equal(clampTourCapacity(0), 1);
  const weeks = expandWeeklyRepeats({ date: "2026-09-16", startTime: "10:00", endTime: "10:30", capacity: 2 });
  assert.deepEqual(
    weeks.map((w) => w.date),
    ["2026-09-16", "2026-09-23", "2026-09-30", "2026-10-07"],
  );
});

test("empty listings stay empty and full or past slots are not bookable", () => {
  assert.equal(tourEmptyReason([]), "none_posted");
  const past = toPublicTourSlot({
    id: "tw_past",
    date: "2020-01-01",
    startTime: "10:00",
    endTime: "10:30",
    capacity: 2,
    booked: 0,
    timezone: "America/Winnipeg",
  });
  const full = toPublicTourSlot({
    id: "tw_full",
    date: "2026-12-01",
    startTime: "10:00",
    endTime: "10:30",
    capacity: 1,
    booked: 1,
    timezone: "America/Winnipeg",
  });
  const open = toPublicTourSlot({
    id: "tw_open",
    date: "2026-12-01",
    startTime: "14:00",
    endTime: "14:30",
    capacity: 2,
    booked: 1,
    timezone: "America/Winnipeg",
  });
  assert.ok(past && full && open);
  assert.equal(remainingTourSeats(full.capacity, full.booked), 0);
  assert.equal(isTourWindowBookable(past, past.timezone, new Date("2026-09-13T18:00:00Z")), false);
  assert.equal(tourEmptyReason([past, full], new Date("2026-09-13T18:00:00Z")), "none_open");
  assert.equal(publicSlotsOpen([past, full, open], new Date("2026-09-13T18:00:00Z")).map((s) => s.id).join(), "tw_open");
  assert.match(formatTourSlotRange(open, "en"), /2026|Dec|Dec\./);
});

test("EN and FR-CA copy keys exist for the tour calendar", () => {
  const text = src("src/lib/copy.ts");
  for (const key of [
    "tourTimes",
    "tourTimesEmpty",
    "tourTimesEmptyLead",
    "tourTimesNoneOpen",
    "tourTimesGuestLead",
    "tourTimesBook",
  ]) {
    const hits = text.match(new RegExp(`${key}:`, "g")) || [];
    assert.ok(hits.length >= 2, `${key} must exist in EN and FR`);
  }
});

test("migration and wiring: Neon windows, desk, listing picker, guest book, no staff scheduling", () => {
  const files = readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql"));
  assert.ok(files.includes("0045_tour_calendar.sql"));
  const mig = src("migrations/0045_tour_calendar.sql");
  assert.match(mig, /create table if not exists tour_windows/);
  assert.match(mig, /America\/Winnipeg/);
  assert.match(mig, /add column if not exists timezone/);
  assert.match(mig, /window_id/);
  assert.doesNotMatch(mig, /shift|payroll|google_calendar|employee_schedule/i);

  const lib = src("src/lib/tour-calendar.ts");
  assert.match(lib, /never invents tour slots/i);
  assert.match(lib, /not staff scheduling/);

  const server = src("src/lib/server/tour-calendar.ts");
  assert.match(server, /export const listPublicTourSlots/);
  assert.match(server, /export const saveTourWindows/);
  assert.match(server, /export const bookTourSlot/);
  assert.match(server, /recordLeadRequest/);
  assert.match(server, /kind: "tour"/);
  const bookFn = server.slice(server.indexOf("export const bookTourSlot"));
  assert.doesNotMatch(bookFn, /authMiddleware/);

  const listing = src("src/routes/daycare.$slug.tsx");
  assert.match(listing, /RequestTourSheet/);
  assert.match(listing, /RequestInfoSheet/);
  assert.match(listing, /ListingTourTimes/);
  assert.match(listing, /onRequestInfo/);
  assert.doesNotMatch(listing, /goLogin\("needSignInTour"/);

  const sheet = src("src/components/request-tour.tsx");
  assert.match(sheet, /listPublicTourSlots/);
  assert.match(sheet, /bookTourSlot/);
  assert.match(sheet, /tourTimesEmpty/);
  assert.match(sheet, /requestInfo/);
  assert.doesNotMatch(sheet, /preferredTimesLead/);

  const desk = src("src/components/tour-availability-desk.tsx");
  assert.match(desk, /saveTourWindows/);
  assert.match(desk, /setDaycareTimezone/);
  assert.match(src("src/routes/provider.tsx"), /TourAvailabilityDesk/);
  assert.match(src("src/lib/desk-nav.ts"), /id: "tours"/);
});
