import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  deriveInboxStage,
  deriveTourHold,
  filterCentreThreads,
  inboxClearsUnreadOn,
  inboxConfirmedDot,
  inboxInitials,
  INBOX_FILTERS,
  parseInboxFilter,
} from "../src/lib/inbox-stages.ts";
import { containsInboxSecret, INBOX_SECRET_MASK, maskInboxPreview } from "../src/lib/inbox-secrets.ts";
import {
  fillQuickReply,
  opsQuickReplies,
  QUICK_REPLY_TEMPLATES,
  quickReplyPreview,
} from "../src/lib/inbox-quick-replies.ts";
import { isCriticalNotification, inboxNotificationHref, leadNotificationHref } from "../src/lib/notifications.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("admissions stages follow inquiry → tour → waitlist without inventing enrolment", () => {
  assert.equal(deriveInboxStage({ hasParentMessage: true }), "new_inquiry");
  assert.equal(deriveInboxStage({ hasParentMessage: true, providerReplied: true }), "info_sent");
  assert.equal(deriveInboxStage({ tourStatus: "pending", providerReplied: true }), "tour_requested");
  assert.equal(deriveInboxStage({ tourStatus: "accepted" }), "tour_booked");
  assert.equal(deriveInboxStage({ tourStatus: "completed" }), "follow_up");
  assert.equal(deriveInboxStage({ bookingStatus: "waitlist" }), "waitlist_enrolled");
  assert.equal(deriveInboxStage({ bookingStatus: "accepted" }), "waitlist_enrolled");
  assert.equal(deriveInboxStage({ tourStatus: "enrolled" }), "waitlist_enrolled");
  assert.equal(deriveInboxStage({}), "support");
  assert.equal(deriveTourHold({ tourStatus: "pending", hasPreferredTimes: true }), "soft_hold");
  assert.equal(deriveTourHold({ tourStatus: "pending", hasPreferredTimes: false }), "open");
  assert.equal(deriveTourHold({ tourStatus: "accepted" }), "confirmed");
  assert.equal(deriveTourHold({ tourStatus: "declined" }), "blocked");
  assert.equal(inboxConfirmedDot({ tourStatus: "accepted" }), true);
  assert.equal(inboxConfirmedDot({ tourStatus: "pending" }), false);
  assert.deepEqual([...INBOX_FILTERS], [
    "all",
    "unread",
    "new_inquiry",
    "info_sent",
    "tour_requested",
    "tour_booked",
    "follow_up",
    "waitlist_enrolled",
    "support",
  ]);
  assert.equal(parseInboxFilter("tour_requested"), "tour_requested");
  assert.equal(parseInboxFilter("nope"), "all");
});

test("opening list or preview never clears unread", () => {
  assert.equal(inboxClearsUnreadOn("list_open"), false);
  assert.equal(inboxClearsUnreadOn("preview"), false);
  assert.equal(inboxClearsUnreadOn("thread_open"), false);
  assert.equal(inboxClearsUnreadOn("mark_read"), true);
  assert.equal(inboxClearsUnreadOn("reply"), true);
  assert.equal(inboxClearsUnreadOn("accept"), true);
  assert.match(src("src/lib/server/family.ts"), /markRead === false/);
  assert.match(src("src/components/centre-inbox.tsx"), /markRead:\s*false/);
  assert.doesNotMatch(src("src/components/centre-inbox.tsx"), /markRead:\s*true/);
  assert.doesNotMatch(src("src/components/notifications-inbox.tsx"), /rows\.some\([\s\S]*all:\s*true/);
});

test("list preview and quick replies never leak door, wifi, PIN, or medical", () => {
  assert.equal(containsInboxSecret("wifi password is maple42"), true);
  assert.equal(containsInboxSecret("door code 4455"), true);
  assert.equal(containsInboxSecret("epi-pen in the backpack"), true);
  assert.equal(containsInboxSecret("See you Thursday at 10"), false);
  const masked = maskInboxPreview("The wifi password is maple42 and allergies include peanuts");
  assert.match(masked, new RegExp(INBOX_SECRET_MASK));
  assert.doesNotMatch(masked, /maple42/);
  assert.doesNotMatch(masked, /peanuts/);
  assert.equal(QUICK_REPLY_TEMPLATES.length >= 5 && QUICK_REPLY_TEMPLATES.length <= 8, true);
  assert.equal(opsQuickReplies().length, QUICK_REPLY_TEMPLATES.length);
  for (const row of QUICK_REPLY_TEMPLATES) {
    assert.equal(containsInboxSecret(row.body), false, row.id);
    assert.equal(containsInboxSecret(row.meta), false, row.id);
    assert.match(row.meta, /All rooms ·/);
    assert.match(row.body, /\{parent_name\}|\{child_age\}|\{tour_datetime\}|\{centre_name\}/);
  }
  const filled = fillQuickReply("Hi {parent_name} at {centre_name} for {child_age} on {tour_datetime}.", {
    parent_name: "Sam",
    child_age: "18 months",
    tour_datetime: "Tue 10:00",
    centre_name: "Sunshine",
  });
  assert.equal(filled, "Hi Sam at Sunshine for 18 months on Tue 10:00.");
  assert.doesNotMatch(quickReplyPreview(QUICK_REPLY_TEMPLATES[0], { parent_name: "Sam" }), /wifi|PIN|door code/i);
});

test("client-side filters run on the cached list", () => {
  const rows = [
    {
      id: "a",
      daycareId: "d1",
      daycareName: "Sunshine",
      daycareSlug: "sunshine",
      photo: "/x.jpg",
      lastAt: "2026-09-13T12:00:00.000Z",
      lastBody: "Hi",
      preview: "Hi",
      status: null,
      tourStatus: "pending",
      phone: null,
      unread: true,
      parentName: "Sam Parent",
      childAgeLabel: "18 months",
      programLabel: "Toddler",
      tourDatetime: "Tue 10:00",
      tourHold: "soft_hold",
      listingVerified: true,
      screeningOnFile: false,
      stage: "tour_requested",
      slaRemainingMs: 3_600_000,
      slaOverdue: false,
      confirmedDot: false,
      staffNote: null,
      subsidyNote: null,
      scheduleNote: null,
      requestInfoCount: 1,
    },
    {
      id: "b",
      daycareId: "d1",
      daycareName: "Sunshine",
      daycareSlug: "sunshine",
      photo: "/x.jpg",
      lastAt: "2026-09-12T12:00:00.000Z",
      lastBody: "Thanks",
      preview: "Thanks",
      status: "waitlist",
      tourStatus: null,
      phone: null,
      unread: false,
      parentName: "Jordan Lee",
      childAgeLabel: null,
      programLabel: null,
      tourDatetime: null,
      tourHold: null,
      listingVerified: false,
      screeningOnFile: true,
      stage: "waitlist_enrolled",
      slaRemainingMs: null,
      slaOverdue: false,
      confirmedDot: false,
      staffNote: null,
      subsidyNote: null,
      scheduleNote: null,
      requestInfoCount: 0,
    },
  ];
  assert.equal(filterCentreThreads(rows, { filter: "unread" }).map((r) => r.id).join(), "a");
  assert.equal(filterCentreThreads(rows, { filter: "waitlist_enrolled" }).map((r) => r.id).join(), "b");
  assert.equal(filterCentreThreads(rows, { filter: "all", query: "jordan" }).map((r) => r.id).join(), "b");
  assert.equal(inboxInitials("Sam Parent"), "SP");
});

test("bell critical kinds deep-link into centre thread + Detail and do not mass-mark", () => {
  assert.equal(isCriticalNotification({ kind: "tour", titleKey: "notifTourNew" }), true);
  assert.equal(isCriticalNotification({ kind: "inbox", titleKey: "notifInbox" }), true);
  assert.equal(isCriticalNotification({ kind: "claim", titleKey: "notifClaimDeclined", status: "declined" }), true);
  assert.equal(isCriticalNotification({ kind: "search_alert", titleKey: "notifSearchAlert" }), false);
  assert.equal(inboxNotificationHref("c1", "centre"), "/inbox/c1?view=centre&detail=1");
  assert.equal(leadNotificationHref({ audience: "provider", conversationId: "c1" }), "/inbox/c1?view=centre&detail=1");
  assert.match(src("src/lib/notifications.ts"), /view=centre&detail=1/);
  assert.match(src("src/components/notifications-inbox.tsx"), /isCriticalNotification/);
  assert.match(src("src/components/inbox-detail-rail.tsx"), /data-ke="inbox-detail"/);
  assert.match(src("src/components/centre-inbox.tsx"), /data-ke="inbox-detail-open"/);
  assert.match(src("src/components/centre-inbox.tsx"), /tour actions|InboxDetailRail|Propose/);
});

test("centre inbox ships three-pane, empty truth, and ops composer — not CMS", () => {
  const desk = src("src/components/centre-inbox.tsx");
  const rail = src("src/components/inbox-detail-rail.tsx");
  const copy = src("src/lib/copy.ts");
  assert.match(desk, /data-ke="centre-inbox"/);
  assert.match(desk, /lg:grid-cols/);
  assert.match(desk, /No parent threads need you|inboxEmptyNeedYou/);
  assert.match(desk, /inboxAttachSoon|Attachments aren't available/);
  assert.match(rail, /Staff only|inboxStaffOnly/);
  assert.match(rail, /Accept/);
  assert.match(rail, /Propose/);
  assert.match(rail, /Decline/);
  assert.doesNotMatch(desk, /Superhost|Instant Book|daily photo|lesson plan|payroll/i);
  assert.doesNotMatch(rail, /listing-readiness|listingHealth\(/);
  assert.match(copy, /inboxEmptyNeedYou: "No parent threads need you"/);
  assert.match(copy, /inboxEmptyNeedYou: "Aucun fil parent n’a besoin de vous"/);
  assert.match(src("src/routes/inbox.tsx"), /CentreInboxDesk|centre-inbox/);
});
