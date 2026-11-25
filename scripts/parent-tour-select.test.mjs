import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  parentRequestRows,
  parentTourBucket,
  parentTourCounts,
  selectParentTours,
} from "../src/lib/parent-request-rows.ts";

const src = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Local wall-clock time: Nov 25, 2026 at 10:00.
const NOW = new Date(2026, 10, 25, 10, 0, 0);

function tour(id, status, slots = []) {
  return {
    id,
    daycareId: `centre-${id}`,
    daycareName: `Centre ${id}`,
    daycareSlug: `centre-${id}`,
    status,
    createdAt: "2026-11-01T00:00:00.000Z",
    conversationId: null,
    preferredTimes: slots.map(([date, time]) => ({ date, time: time ?? "" })),
  };
}

const pastAccepted = tour("past", "accepted", [["2026-11-20", "10:00"]]);
const acceptedNoDate = tour("nodate", "accepted");
const futureConfirmed = tour("future", "confirmed", [["2026-11-30", "14:00"]]);
const futureAccepted = tour("tomorrow", "accepted", [["2026-11-26", "09:30"]]);
const pending = tour("pending", "pending", [["2026-12-02", "11:00"]]);
const pendingPast = tour("stale", "pending", [["2026-11-01", "11:00"]]);
const declined = tour("declined", "declined", [["2026-12-05", "11:00"]]);
const completed = tour("completed", "completed", [["2026-11-10", "11:00"]]);
const laterToday = tour("today", "accepted", [["2026-11-25", "15:00"]]);
const earlierToday = tour("morning", "accepted", [["2026-11-25", "08:00"]]);

test("a past accepted tour is past, not Confirmed", () => {
  assert.equal(parentTourBucket(pastAccepted, NOW), "past");
  assert.equal(parentTourBucket(earlierToday, NOW), "past");
  assert.equal(parentTourBucket(completed, NOW), "past");
  assert.equal(parentTourBucket(pendingPast, NOW), "past");
  assert.equal(parentTourBucket(declined, NOW), "past");
});

test("accepted with no date still needs a time, so it is not Confirmed", () => {
  assert.equal(parentTourBucket(acceptedNoDate, NOW), "needsReply");
});

test("confirmed and accepted with a future date are upcoming", () => {
  assert.equal(parentTourBucket(futureConfirmed, NOW), "upcoming");
  assert.equal(parentTourBucket(futureAccepted, NOW), "upcoming");
  assert.equal(parentTourBucket(laterToday, NOW), "upcoming");
});

test("pending with a future date needs a reply", () => {
  assert.equal(parentTourBucket(pending, NOW), "needsReply");
});

test("selectParentTours splits and sorts soonest first", () => {
  const all = [pastAccepted, acceptedNoDate, futureConfirmed, futureAccepted, pending, declined, completed, laterToday];
  const selection = selectParentTours(all, NOW);
  assert.deepEqual(selection.upcoming.map((t) => t.id), ["today", "tomorrow", "future"]);
  assert.deepEqual(selection.needsReply.map((t) => t.id), ["pending", "nodate"]);
  assert.deepEqual(selection.past.map((t) => t.id).sort(), ["completed", "declined", "past"]);
  assert.deepEqual(selectParentTours(null, NOW), { upcoming: [], needsReply: [], past: [] });
});

test("home and calendar counts match for the same input", () => {
  const all = [pastAccepted, acceptedNoDate, futureConfirmed, pending];
  const selection = selectParentTours(all, NOW);
  const counts = parentTourCounts(selection);
  assert.deepEqual(counts, { openRequests: 2, bookedSeats: 1, postedTimes: 0 });
  // Home shows the first upcoming tour as Confirmed.
  assert.equal(selection.upcoming[0]?.id, "future");
  // A list with only a past accepted tour shows no next tour and no Confirmed count.
  const onlyPast = selectParentTours([pastAccepted], NOW);
  assert.equal(onlyPast.upcoming.length + onlyPast.needsReply.length, 0);
  assert.equal(parentTourCounts(onlyPast).bookedSeats, 0);
});

test("Requests rows label tours with the shared selector", () => {
  const rows = parentRequestRows({ tours: [acceptedNoDate, futureAccepted, pending], now: NOW });
  const status = Object.fromEntries(rows.map((row) => [row.id, row.status]));
  assert.equal(status.nodate, "waiting");
  assert.equal(status.tomorrow, "confirmed");
  assert.equal(status.pending, "waiting");
});

test("home, Requests, Enrolled and the tour calendar read selectParentTours", () => {
  const home = src("src/components/parent-home.tsx");
  assert.match(home, /selectParentTours\(tours, new Date\(\)\)/);
  assert.doesNotMatch(home, /String\(tour\.status\) === "confirmed"/);
  assert.match(home, /nextTourConfirmed\s*\?\s*` · \$\{t\("parentTourConfirmed"\)\}`/);
  const desk = src("src/components/parent-desk.tsx");
  assert.match(desk, /tourCounts=\{parentTourCounts\(selectParentTours\(tours, new Date\(\)\)\)\}/);
  // The Requests / Enrolled tab waits for tours before it says "no requests".
  assert.match(desk, /extrasState !== "ready" \? \(\s*<p[^>]*data-ke="parent-requests-loading"/);
  const calendar = src("src/components/tour-calendar-page.tsx");
  assert.match(calendar, /selectParentTours\(rows, new Date\(\)\)/);
  assert.match(calendar, /parentTourCounts\(selectParentTours\(tours, now\)\)/);
});
