import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  WAITLIST_EVENTS,
  canWithdrawWaitlist,
  parentWaitlistStatus,
  waitlistEmailAllowed,
  waitlistEntriesForAlerts,
  waitlistEventProps,
  waitlistQuietNow,
  waitlistStatusEmail,
} from "../src/lib/waitlist-tracker.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

test("booking statuses map to the parent words", () => {
  assert.equal(parentWaitlistStatus("requested"), "sent");
  assert.equal(parentWaitlistStatus("under_review"), "seen");
  assert.equal(parentWaitlistStatus("waitlist"), "waitlisted");
  assert.equal(parentWaitlistStatus("accepted"), "offered");
  assert.equal(parentWaitlistStatus("active"), "offered");
  assert.equal(parentWaitlistStatus("declined"), "declined");
  assert.equal(parentWaitlistStatus("cancelled"), "withdrawn");
  assert.equal(parentWaitlistStatus("invented"), null);
});

test("a parent can withdraw an open request, not a closed one", () => {
  assert.equal(canWithdrawWaitlist("sent"), true);
  assert.equal(canWithdrawWaitlist("seen"), true);
  assert.equal(canWithdrawWaitlist("waitlisted"), true);
  assert.equal(canWithdrawWaitlist("offered"), true);
  assert.equal(canWithdrawWaitlist("declined"), false);
  assert.equal(canWithdrawWaitlist("withdrawn"), false);
});

test("status email stays off after 9 PM, without consent, or when unsubscribed", () => {
  assert.equal(waitlistEmailAllowed({ quiet: false, emailConsent: true, suppressed: false }), true);
  assert.equal(waitlistEmailAllowed({ quiet: true, emailConsent: true, suppressed: false }), false);
  assert.equal(waitlistEmailAllowed({ quiet: false, emailConsent: false, suppressed: false }), false);
  assert.equal(waitlistEmailAllowed({ quiet: false, emailConsent: true, suppressed: true }), false);
  assert.equal(waitlistQuietNow(new Date("2026-10-01T02:30:00Z")), true);
  assert.equal(waitlistQuietNow(new Date("2026-10-01T16:00:00Z")), false);
});

test("status email names the centre and status only", () => {
  const letter = waitlistStatusEmail({ centre: "Sunny Side", status: "waitlisted" });
  assert.match(letter.subject, /Sunny Side/);
  assert.match(letter.text, /Waitlisted/);
  assert.match(letter.text, /En attente/);
  assert.match(letter.text, /\/parent\?tab=waitlists/);
  assert.doesNotMatch(letter.text, /@|child|birth/i);
  const tagged = waitlistStatusEmail({ centre: "<Ada>", status: "sent" });
  assert.equal(tagged.html.includes("<Ada>"), false);
  assert.equal(tagged.html.includes("Ada"), true);
});

test("spot-alert hook drops closed rows and parent details", () => {
  const rows = waitlistEntriesForAlerts([
    { status: "requested", email: "a@b.ca", childName: "Ada", parentName: "Pat", phone: "204", userId: "u1" },
    { status: "declined", userId: "u2" },
    { status: "cancelled", userId: "u3" },
    { status: "waitlist", userId: "u4", phone: "555" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].userId, "u1");
  assert.equal("email" in rows[0], false);
  assert.equal("childName" in rows[0], false);
  assert.equal("parentName" in rows[0], false);
  assert.equal("phone" in rows[0], false);
  assert.equal("phone" in rows[1], false);
});

test("events stay on the allowlist and never carry an email", () => {
  assert.deepEqual([...WAITLIST_EVENTS], ["waitlist_viewed", "waitlist_status_changed", "waitlist_withdrawn"]);
  const props = waitlistEventProps({ daycareId: "dc-1", status: "under_review", count: 2 });
  assert.equal(props.daycare_id, "dc-1");
  assert.equal(props.status, "seen");
  assert.equal(props.count, 2);
  assert.equal(waitlistEventProps({ daycareId: "a@b.ca" }).daycare_id, undefined);
});

test("the list, mail, and alert hook stay scoped to one parent", () => {
  const server = src("src/lib/server/waitlist-tracker.ts");
  assert.match(server, /where b\.user_id = \$\{context\.userId\}/);
  assert.match(server, /where id = \$\{data\.bookingId\} and user_id = \$\{context\.userId\}/);
  const listSql = server.slice(server.indexOf("select b.id"), server.indexOf("from bookings b"));
  assert.doesNotMatch(listSql, /child_name|parent_name|email/);
  const factsStart = server.indexOf("export async function listOpenWaitlistFacts");
  const factsSql = server.slice(factsStart, server.indexOf("from bookings", factsStart));
  assert.doesNotMatch(factsSql, /child_name|parent_name|email/);
  assert.match(server, /purpose: "service"/);
  assert.match(server, /isSuppressed/);
  assert.match(server, /waitlistQuietNow/);
  assert.doesNotMatch(src("src/lib/server/waitlist-tracker.ts").slice(server.indexOf("withdrawMyWaitlist"), server.indexOf("deliverWaitlistMail")), /sendTransactionalMail/);
  const alerts = src("src/lib/server/spot-alerts.ts");
  assert.match(alerts, /listOpenWaitlistFacts/);
  const page = src("src/components/my-waitlists.tsx");
  assert.match(page, /waitlist_viewed/);
  assert.match(page, /waitlist_withdrawn/);
  const inbox = src("src/routes/inbox.$id.tsx");
  assert.match(inbox, /waitlist_status_changed/);
  assert.doesNotMatch(src("src/lib/waitlist-tracker.ts"), /spots_infant|spots_toddler|spots_preschool/);
});
