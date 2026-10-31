import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { tourPipelineEnabled } from "../src/lib/features.ts";
import { tourCalendarFile, tourReminderLetter } from "../src/lib/tour-ics.ts";
import { nextTourPipeline, tourToPipelineStage } from "../src/lib/tour-pipeline.ts";
import { tourStatusBody } from "../src/lib/threads.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

test("tour pipeline extras default off", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_TOUR_PIPELINE, false);
  assert.equal(tourPipelineEnabled({}), false);
  assert.equal(tourPipelineEnabled({ FEATURE_TOUR_PIPELINE: "1" }), true);
  assert.match(read(".env.example"), /^FEATURE_TOUR_PIPELINE=0$/m);
  assert.doesNotMatch(read(".env.example"), /^FEATURE_TOUR_PIPELINE=1$/m);
});

test("no-show is its own stage and a confirmed reminder says the visit is confirmed", () => {
  assert.equal(tourToPipelineStage("no_show"), "no_show");
  assert.equal(nextTourPipeline("accepted", "no_show"), "no_show");
  assert.equal(nextTourPipeline("pending", "no_show"), null);
  const body = tourStatusBody({ status: "no_show", daycareName: "Bright Start" });
  assert.match(body, /did not arrive/);
  assert.match(body, /Bright Start/);
  const pending = tourReminderLetter("en", "Bright Start", "pending");
  const accepted = tourReminderLetter("en", "Bright Start", "accepted");
  assert.match(pending.reminder, /confirms the time/);
  assert.match(accepted.reminder, /is confirmed/);
  assert.match(tourReminderLetter("fr", "Bright Start", "accepted").sms, /confirmée/);
  const ics = tourCalendarFile({
    uid: "tr_test",
    centre: "Bright Start",
    startAt: "2026-11-02T15:00:00.000Z",
    location: "1 Main St, Winnipeg",
  });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /Bright Start/);
  assert.doesNotMatch(ics, /child name|infant|toddler/i);
  assert.equal(tourCalendarFile({ uid: "x", centre: "A", startAt: "nope" }), null);
});

test("no-show, reminder moves, and calendar mail stay behind the flag", () => {
  const tours = read("src/lib/server/tours.ts");
  const reminders = read("src/lib/server/tour-reminders.ts");
  const card = read("src/components/tour-card.tsx");
  assert.match(tours, /No-show is not open yet/);
  assert.match(tours, /moveTourReminder/);
  assert.match(reminders, /tourPipelineEnabled/);
  assert.match(reminders, /tourCalendarFile/);
  assert.match(card, /no_show/);
  assert.match(card, /localePath\("\/help"/);
  assert.match(read("migrations/0116_tour_no_show.sql"), /no_show/);
  assert.doesNotMatch(tours, /crm-pipeline/);
  assert.doesNotMatch(card, /google/i);
});
