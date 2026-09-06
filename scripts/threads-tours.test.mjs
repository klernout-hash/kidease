import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  canRespondTour,
  formatPreferredTimes,
  nextTourStatus,
  normalizePreferredTime,
  parsePreferredTimes,
  preferredTimesValid,
  resolveThreadAccess,
  serializePreferredTimes,
  tourStatusBody,
  tourSystemBody,
} from "../src/lib/threads.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("thread AuthZ: parent and centre write; admin view-only; strangers denied", () => {
  const parent = resolveThreadAccess({
    userId: "u-parent",
    parentUserId: "u-parent",
    isCentreOwner: false,
    isAdmin: false,
  });
  assert.equal(parent.role, "parent");
  assert.equal(parent.canRead, true);
  assert.equal(parent.canWrite, true);

  const centre = resolveThreadAccess({
    userId: "u-dir",
    parentUserId: "u-parent",
    isCentreOwner: true,
    isAdmin: false,
  });
  assert.equal(centre.role, "centre");
  assert.equal(centre.canWrite, true);

  const admin = resolveThreadAccess({
    userId: "u-admin",
    parentUserId: "u-parent",
    isCentreOwner: false,
    isAdmin: true,
  });
  assert.equal(admin.role, "admin");
  assert.equal(admin.canRead, true);
  assert.equal(admin.canWrite, false);

  const stranger = resolveThreadAccess({
    userId: "u-other",
    parentUserId: "u-parent",
    isCentreOwner: false,
    isAdmin: false,
  });
  assert.equal(stranger.canRead, false);
  assert.equal(stranger.canWrite, false);
});

test("preferred times parse, serialize, and reject junk", () => {
  const ok = parsePreferredTimes([
    { date: "2026-09-15", time: "09:30" },
    { date: "2026-09-16", time: "14:00" },
    { date: "nope", time: "99:99" },
  ]);
  assert.equal(ok.length, 2);
  assert.equal(preferredTimesValid(ok), true);
  assert.equal(preferredTimesValid([]), false);
  assert.deepEqual(normalizePreferredTime({ date: "2026-09-15", time: "09:30" }), {
    date: "2026-09-15",
    time: "09:30",
  });
  assert.equal(normalizePreferredTime({ date: "15-09-2026", time: "9:30" }), null);
  const json = serializePreferredTimes(ok);
  assert.deepEqual(parsePreferredTimes(json), ok);
  assert.match(formatPreferredTimes(ok, "en"), /2026/);
});

test("tour status only moves pending → accepted|declined", () => {
  assert.equal(canRespondTour("pending"), true);
  assert.equal(canRespondTour("accepted"), false);
  assert.equal(nextTourStatus("pending", "accepted"), "accepted");
  assert.equal(nextTourStatus("pending", "declined"), "declined");
  assert.equal(nextTourStatus("accepted", "declined"), null);
  assert.equal(nextTourStatus("pending", "pending"), null);
});

test("tour copy stays text-only and names the centre", () => {
  const system = tourSystemBody({
    parentName: "Sam",
    childName: "Ira",
    daycareName: "Bright Start",
    times: [{ date: "2026-09-15", time: "09:30" }],
    note: "After drop-off",
  });
  assert.match(system, /Sam for Ira/);
  assert.match(system, /Bright Start/);
  assert.match(system, /After drop-off/);
  const accepted = tourStatusBody({ status: "accepted", daycareName: "Bright Start", note: "Tue 9:30" });
  assert.match(accepted, /accepted/);
  assert.match(accepted, /Tue 9:30/);
  const declined = tourStatusBody({ status: "declined", daycareName: "Bright Start" });
  assert.match(declined, /declined/);
});

test("migration and wiring: tour table, ungated send, listing + desks", () => {
  const files = readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql"));
  assert.ok(files.includes("0028_thread_tours.sql"));
  const mig = src("migrations/0028_thread_tours.sql");
  assert.match(mig, /create table if not exists tour_requests/);
  assert.match(mig, /conversation_reads/);
  assert.match(mig, /pending.*accepted.*declined/s);

  const inbox = src("src/lib/server/inbox.ts");
  assert.doesNotMatch(inbox, /Message centre opens after a parent requests a spot/);
  assert.match(inbox, /requireConversationWrite/);
  assert.match(inbox, /notifyThreadParty/);
  assert.match(inbox, /conversation_reads/);

  const family = src("src/lib/server/family.ts");
  assert.match(family, /requireConversationRead/);
  assert.match(family, /listToursForConversation/);
  assert.match(family, /canWrite: access.canWrite/);

  const listing = src("src/routes/daycare.$slug.tsx");
  assert.match(listing, /RequestTourSheet/);
  assert.match(listing, /openConversation/);
  assert.doesNotMatch(listing, /intent="tour"/);

  const thread = src("src/routes/inbox.$id.tsx");
  assert.match(thread, /TourCard/);
  assert.match(thread, /canWrite/);
  assert.doesNotMatch(thread, /This enrolment is closed. Messaging is off/);

  const provider = src("src/routes/provider.tsx");
  assert.match(provider, /listTourRequests/);
  assert.match(provider, /pendingTours/);

  const parent = src("src/components/parent-desk.tsx");
  assert.match(parent, /listTourRequests/);
  assert.match(parent, /TourCard/);

  const notify = src("src/lib/server/notify.ts");
  assert.match(notify, /tour_request/);
  assert.match(notify, /export async function notifyThreadParty/);

  const scaffold = src("src/lib/chat-scaffold.ts");
  assert.match(scaffold, /tour_requests/);
  assert.match(scaffold, /not Stream, not Sendbird/);
});
