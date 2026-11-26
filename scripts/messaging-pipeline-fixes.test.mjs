import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { keepLangParam } from "../src/lib/locale-search.ts";
import { groupNotifications, markItemsRead, notificationTimeLabel } from "../src/lib/notification-groups.ts";
import { createSessionFetch, isSessionRead, sessionRetryDelayMs } from "../src/lib/auth/session-fetch.ts";
import { tourCalendarPack, wallTimeToInstant } from "../src/lib/tour-add-to-calendar.ts";
import { blockDialogText } from "../src/lib/safety.ts";
import { resetThreadBlocks, setThreadBlocked, subscribeThreadBlocks, threadBlocked } from "../src/lib/thread-block-state.ts";
import { visitorAutoReplyCopy } from "../src/lib/server/notify-mail.ts";
import { inboxTimeLabel } from "../src/lib/inbox-thread-ui.ts";
import { formatVisitSlot, parentRequestRows } from "../src/lib/parent-request-rows.ts";
import { localizeApiError, API_ERROR_FALLBACK_FR } from "../src/lib/api-error-copy.ts";
import { testListingMailAllowed } from "../src/lib/test-listing-mail.ts";
import { absenceNoticeKey, centreAbsenceCancelledNotice, centreAbsenceNotice, parentAbsenceCancelledBody } from "../src/lib/absence-notice.ts";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("keepLangParam keeps ?lang unless the link sets its own", () => {
  assert.deepEqual(keepLangParam({ lang: "fr" }, { tab: "requests" }), { tab: "requests", lang: "fr" });
  assert.deepEqual(keepLangParam({ lang: "fr" }, { lang: "en" }), { lang: "en" });
  assert.deepEqual(keepLangParam({}, { tab: "x" }), { tab: "x" });
  assert.deepEqual(keepLangParam({ lang: "zz" }, {}), {});
  assert.match(src("src/routes/__root.tsx"), /keepLangParam/);
});

const item = (id, extra = {}) => ({ id, kind: "inbox", titleKey: "notifInbox", href: "/inbox/a", sourceKey: id, createdAt: "2026-11-25T23:30:00.000Z", readAt: null, daycareName: "Oak", status: null, ...extra });

test("repeated New message rows fold into one with a count", () => {
  const groups = groupNotifications([item("1"), item("2", { readAt: "x" }), item("3", { href: "/inbox/b" })]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].count, 2);
  assert.deepEqual(groups[0].ids, ["1", "2"]);
  assert.equal(groups[0].unread, true);
  const read = markItemsRead([item("1"), item("2")], ["1"], "T");
  assert.equal(read[0].readAt, "T");
  assert.equal(read[1].readAt, null);
  assert.ok(markItemsRead([item("1")], "all", "T").every((row) => row.readAt === "T"));
  assert.match(notificationTimeLabel("2026-11-25T23:30:00.000Z", "en"), /Nov 25/);
});

test("FR critical alert label is Important, not Urgent", () => {
  assert.match(src("src/lib/unified-alerts.ts"), /critical: "Important"/);
});

test("get-session is deduped, cached briefly, and retried on 429", async () => {
  let calls = 0;
  let status = 429;
  const base = async () => {
    calls += 1;
    const res = new Response(JSON.stringify({ ok: calls }), { status, headers: { "retry-after": "0" } });
    status = 200;
    return res;
  };
  let t = 0;
  const f = createSessionFetch(base, { now: () => t, sleep: async () => {} });
  const url = "https://x/api/auth/get-session";
  const [a, b] = await Promise.all([f.fetch(url), f.fetch(url)]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(calls, 2); // one 429 then one 200, shared by both callers
  await f.fetch(url);
  assert.equal(calls, 2); // cached
  t = 5000;
  await f.fetch(url);
  assert.equal(calls, 3);
  assert.equal(isSessionRead("https://x/api/auth/sign-out", { method: "POST" }), false);
  assert.ok(sessionRetryDelayMs("10", 0) <= 4000);
  assert.match(src("src/lib/auth/server.ts"), /"\/get-session": \{ window: 60, max: 600 \}/);
});

test("thread list time uses the centre zone and a date for older days", () => {
  const now = new Date("2026-11-26T03:00:00.000Z"); // Nov 25 21:00 Winnipeg
  const today = inboxTimeLabel("2026-11-26T01:00:00.000Z", now, "en", "America/Winnipeg");
  assert.doesNotMatch(today, /Nov/);
  assert.match(inboxTimeLabel("2026-11-20T18:00:00.000Z", now, "en", "America/Winnipeg"), /Nov|20/);
});

test("add to calendar: wall time in the centre zone, EN and FR", () => {
  // Round-trip through the zone so the test follows tzdata (Manitoba rules changed in 2026).
  const start = wallTimeToInstant("2026-11-26", "10:00", "America/Winnipeg");
  const back = start.toLocaleTimeString("en-CA", { timeZone: "America/Winnipeg", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  assert.equal(back, "10:00");
  assert.equal(wallTimeToInstant("2026-11-26", "10:00", "America/Regina").toISOString(), "2026-11-26T16:00:00.000Z");
  const summer = wallTimeToInstant("2026-07-02", "10:00", "America/Toronto");
  assert.equal(summer.toISOString(), "2026-07-02T14:00:00.000Z");
  const en = tourCalendarPack({ tourId: "t1", centreName: "Oak", date: "2026-11-26", time: "10:00", timeZone: "America/Winnipeg", locale: "en" });
  assert.match(en.ics, /BEGIN:VEVENT/);
  assert.match(en.google, /ctz=America%2FWinnipeg/);
  const fr = tourCalendarPack({ tourId: "t1", centreName: "Oak", date: "2026-11-26", time: "10:00", timeZone: "America/Winnipeg", locale: "fr" });
  assert.equal(fr.fileName, "kidease-visite.ics");
  assert.match(fr.ics, /Visite/);
  assert.equal(tourCalendarPack({ tourId: "t", centreName: "x", date: "bad", time: "10:00" }), null);
});

test("block dialog words match the trigger, EN and FR", () => {
  const en = blockDialogText("en", "daycare");
  assert.ok(en.title && en.confirm && en.composer);
  assert.match(en.composer, /Unblock to send/);
  assert.equal(blockDialogText("en", "family").trigger, "Block this family");
  assert.equal(blockDialogText("fr", "family").trigger, "Bloquer cette famille");
  assert.notEqual(blockDialogText("fr", "daycare").composer, en.composer);
});

test("thread block store notifies listeners", () => {
  resetThreadBlocks();
  let hits = 0;
  const off = subscribeThreadBlocks(() => (hits += 1));
  setThreadBlocked("c1", true);
  assert.equal(threadBlocked("c1"), true);
  setThreadBlocked("c1", false);
  assert.equal(threadBlocked("c1"), false);
  off();
  assert.equal(hits, 2);
});

test("contact acknowledgement is French for a French form", () => {
  assert.equal(visitorAutoReplyCopy("fr").lang, "fr");
  assert.match(visitorAutoReplyCopy("fr").subject, /reçu/);
  assert.equal(visitorAutoReplyCopy("en").lang, "en");
});

test("Requests shows the booked slot, not a UTC-shifted date", () => {
  const rows = parentRequestRows({
    tours: [{ id: "t", daycareId: "d", daycareName: "Oak", daycareSlug: "oak", status: "accepted", createdAt: "2026-11-25T00:00:00.000Z", conversationId: "c", preferredTimes: [{ date: "2026-11-26", time: "10:00" }] }],
    now: new Date("2026-11-25T12:00:00.000Z"),
  });
  assert.equal(rows[0].tourDate, "2026-11-26T10:00");
  assert.match(formatVisitSlot("2026-11-26T10:00", "en"), /Nov 26/);
  assert.match(formatVisitSlot("2026-11-26T10:00", "en"), /10:00/);
  assert.match(formatVisitSlot("2026-11-26", "fr"), /26/);
});

test("API errors read in French on French pages", () => {
  assert.equal(localizeApiError("This listing is not open for a waitlist.", "en"), "This listing is not open for a waitlist.");
  assert.match(localizeApiError("This listing is not open for a waitlist.", "fr"), /liste d’attente/);
  assert.equal(localizeApiError("Something odd broke", "fr"), API_ERROR_FALLBACK_FR);
  assert.equal(localizeApiError("Déjà envoyé.", "fr"), "Déjà envoyé.");
});

test("test-listing mail reaches only a named QA address", () => {
  assert.equal(testListingMailAllowed("qa@x.ca", "qa@x.ca, b@y.ca"), true);
  assert.equal(testListingMailAllowed("other@x.ca", "qa@x.ca"), false);
  assert.equal(testListingMailAllowed("other@x.ca", "*"), false);
  assert.equal(testListingMailAllowed("", "qa@x.ca"), false);
});

test("absence notices for the centre, EN and FR, with undo", () => {
  assert.match(centreAbsenceNotice({ status: "sick", childName: "Ava", localDay: "2026-11-25", locale: "en" }), /Ava will be sick/);
  assert.match(centreAbsenceNotice({ status: "absent", childName: "Ava", localDay: "2026-11-25", locale: "fr" }), /absent/);
  assert.match(centreAbsenceCancelledNotice({ childName: "Ava", localDay: "2026-11-25", locale: "en" }), /cancelled/);
  assert.match(parentAbsenceCancelledBody({ childName: "Ava", daycareName: "Oak", localDay: "2026-11-25", locale: "fr" }), /annulée/);
  assert.equal(absenceNoticeKey({ bookingId: "b", localDay: "d", status: "sick" }), "absence:b:d:sick");
  const server = src("src/lib/server/child-checkin.ts");
  assert.match(server, /cancelMyChildAbsence/);
  assert.match(src("src/lib/server/attendance-handoff.ts"), /parentReport: reports\.get/);
});

test("pipeline source guards", () => {
  assert.match(src("src/lib/server/first-run.ts"), /w\.start_at > now\(\)\) as tour_times/);
  assert.doesNotMatch(src("src/routes/daycare.$slug.tsx"), /finished opening/);
  assert.match(src("src/routes/daycare.$slug.tsx"), /listing-early-spot/);
  assert.match(src("src/components/request-info.tsx"), /\(obligatoire\)/);
  assert.match(src("src/components/request-info.tsx"), /withTimeout\(/);
  assert.match(src("src/components/request-tour.tsx"), /date \? slots\.filter/);
  assert.match(src("src/components/listing-tour-times.tsx"), /listing-tour-times-readonly/);
  assert.match(src("src/lib/server/notifications.ts"), /projectFromTours\(sql, userId\)/);
  assert.match(src("src/routes/c.$slug.tsx"), /<Shell>/);
});
