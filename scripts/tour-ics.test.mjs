import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildTourIcs, tourCalendarLinks, tourInviteCopy, tourReminderAt, tourSlotInstants, tourUpdateCalendarText } from "../src/lib/tour-ics.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("calendar file names the centre and not the child", () => {
  const range = tourSlotInstants({
    startAt: "2026-11-02T15:00:00.000Z",
    startTime: "10:00",
    endTime: "10:30",
  });
  assert.ok(range);
  assert.equal(range.end.getTime() - range.start.getTime(), 30 * 60 * 1000);
  const ics = buildTourIcs({
    uid: "tr_test",
    title: "Visit: Maple Care",
    start: range.start,
    end: range.end,
    location: "12 Main St, Winnipeg, MB",
    description: "The centre still has to confirm.",
  });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /SUMMARY:Visit: Maple Care/);
  assert.match(ics, /DTSTART:20261102T150000Z/);
  assert.match(ics, /DTEND:20261102T153000Z/);
  assert.doesNotMatch(ics, /CHILD|parent@|phone/i);
});

test("reminder is a day before, or two hours before when the visit is sooner", () => {
  const start = "2026-11-04T18:00:00.000Z";
  const early = tourReminderAt(start, new Date("2026-11-01T12:00:00.000Z"));
  assert.equal(early?.toISOString(), "2026-11-03T18:00:00.000Z");
  const soon = tourReminderAt(start, new Date("2026-11-04T12:00:00.000Z"));
  assert.equal(soon?.toISOString(), "2026-11-04T16:00:00.000Z");
  const tooLate = tourReminderAt(start, new Date("2026-11-04T17:00:00.000Z"));
  assert.equal(tooLate, null);
});

test("invite copy is bilingual and the job is wired", () => {
  const fr = tourInviteCopy("fr", "Garderie du coin");
  assert.match(fr.subject, /Visite/);
  assert.match(fr.reminder, /Rappel/);
  assert.match(fr.sms, /KidEase/);
  const en = tourInviteCopy("en", "Corner Care");
  assert.match(en.text, /does not give out the spot/);
  const job = readFileSync(join(root, "src/lib/server/tour-holds.ts"), "utf8");
  const book = readFileSync(join(root, "src/lib/server/tour-calendar.ts"), "utf8");
  assert.match(job, /sendDueTourReminders/);
  assert.match(book, /scheduleTourReminder/);
  assert.match(book, /sendTourBookedMail/);
  assert.match(book, /startAt: slot.startAt/);
});

test("confirmation mail can add Google, Outlook, and a cancel update", () => {
  const range = tourSlotInstants({
    startAt: "2026-11-02T15:00:00.000Z",
    startTime: "10:00",
    endTime: "10:30",
  });
  assert.ok(range);
  const links = tourCalendarLinks({
    uid: "tr_test",
    title: "Tour: Maple Care",
    start: range.start,
    end: range.end,
    location: "12 Main St",
    description: "The centre confirms the time.",
  });
  assert.match(links.google, /calendar\.google\.com\/calendar\/render/);
  assert.match(links.outlook, /outlook\.office\.com\/calendar/);
  assert.match(links.ics, /METHOD:REQUEST/);
  const updated = tourUpdateCalendarText({
    uid: "tr_test",
    centre: "Maple Care",
    startAt: "2026-11-02T15:00:00.000Z",
    startTime: "10:00",
    endTime: "10:30",
    sequence: 2,
  });
  assert.match(updated, /Add to Google Calendar/);
  assert.match(updated, /Add to Outlook/);
  const cancelled = buildTourIcs({
    uid: "tr_test",
    title: "Tour: Maple Care",
    start: range.start,
    end: range.end,
    location: "",
    description: "Cancelled",
    method: "CANCEL",
    sequence: 3,
  });
  assert.match(cancelled, /METHOD:CANCEL/);
  assert.match(cancelled, /STATUS:CANCELLED/);
  assert.match(readFileSync(join(root, "src/lib/server/tours.ts"), "utf8"), /Tour cancelled/);
});
