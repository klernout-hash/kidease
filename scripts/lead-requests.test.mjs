import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  actionToLeadStatus,
  bookingStatusToLead,
  canReadLead,
  canUpdateLeadStatus,
  isLeadKind,
  isLeadStatus,
  isListingAsk,
  leadKindCopyKey,
  leadKindFromAsk,
  leadNotifyKind,
  leadReplyPreview,
  leadStatusCopyKey,
  listingAskHref,
  nextLeadStatus,
  parseListingAsk,
  tallyLeadCounts,
  tourStatusToLead,
} from "../src/lib/lead-requests.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("lead kinds and statuses are the track vocabulary only", () => {
  assert.equal(isLeadKind("tour"), true);
  assert.equal(isLeadKind("waitlist"), true);
  assert.equal(isLeadKind("spot_inquiry"), true);
  assert.equal(isLeadKind("chat"), false);
  assert.equal(isLeadStatus("requested"), true);
  assert.equal(isLeadStatus("confirmed"), true);
  assert.equal(isLeadStatus("declined"), true);
  assert.equal(isLeadStatus("received"), true);
  assert.equal(isLeadStatus("answered"), true);
  assert.equal(isLeadStatus("closed"), true);
  assert.equal(isLeadStatus("pending"), false);
  assert.equal(isLeadStatus("accepted"), false);
});

test("daycare actions map to confirm / decline / answered", () => {
  assert.equal(actionToLeadStatus("confirm"), "confirmed");
  assert.equal(actionToLeadStatus("decline"), "declined");
  assert.equal(actionToLeadStatus("answered"), "answered");
  assert.equal(nextLeadStatus("requested", "confirm"), "confirmed");
  assert.equal(nextLeadStatus("requested", "decline"), "declined");
  assert.equal(nextLeadStatus("requested", "answered"), "answered");
  assert.equal(nextLeadStatus("confirmed", "confirm"), null);
  assert.equal(nextLeadStatus("declined", "answered"), null);
  assert.equal(nextLeadStatus("closed", "confirm"), null);
  assert.equal(nextLeadStatus("junk", "confirm"), null);
});

test("existing tour and booking statuses map into lead track statuses", () => {
  assert.equal(tourStatusToLead("pending"), "requested");
  assert.equal(tourStatusToLead("accepted"), "confirmed");
  assert.equal(tourStatusToLead("declined"), "declined");
  assert.equal(tourStatusToLead("lost"), "declined");
  assert.equal(tourStatusToLead("completed"), "closed");
  assert.equal(tourStatusToLead("enrolled"), "closed");
  assert.equal(bookingStatusToLead("requested"), "requested");
  assert.equal(bookingStatusToLead("under_review"), "received");
  assert.equal(bookingStatusToLead("waitlist"), "received");
  assert.equal(bookingStatusToLead("accepted"), "confirmed");
  assert.equal(bookingStatusToLead("declined"), "declined");
  assert.equal(bookingStatusToLead("active"), "closed");
  assert.equal(bookingStatusToLead("cancelled"), "closed");
});

test("listing ?ask= deep-links tour, spot, and waitlist", () => {
  assert.equal(isListingAsk("tour"), true);
  assert.equal(isListingAsk("spot"), true);
  assert.equal(isListingAsk("waitlist"), true);
  assert.equal(parseListingAsk("chat"), undefined);
  assert.equal(leadKindFromAsk("spot"), "spot_inquiry");
  assert.equal(leadKindFromAsk("tour"), "tour");
  assert.equal(listingAskHref("elm-grove", "tour"), "/daycare/elm-grove?ask=tour");
});

test("lead counts tally open vs decided", () => {
  const counts = tallyLeadCounts(["requested", "received", "confirmed", "answered", "declined", "closed", "junk"]);
  assert.equal(counts.open, 2);
  assert.equal(counts.requested, 1);
  assert.equal(counts.received, 1);
  assert.equal(counts.confirmed, 1);
  assert.equal(counts.answered, 1);
  assert.equal(counts.declined, 1);
  assert.equal(counts.closed, 1);
  assert.equal(counts.total, 6);
});

test("parent who filed a lead can read it; they cannot update status", () => {
  assert.equal(
    canReadLead({
      actorUserId: "p1",
      parentUserId: "p1",
      daycareId: "dc1",
      ownedDaycareIds: [],
    }),
    true,
  );
  assert.equal(
    canUpdateLeadStatus({ daycareId: "dc1", ownedDaycareIds: [], isAdmin: false }),
    false,
  );
  assert.equal(
    canUpdateLeadStatus({ daycareId: "dc1", ownedDaycareIds: ["dc1"] }),
    true,
  );
});

test("notify kinds stay on existing Resend paths — no GHL", () => {
  assert.equal(leadNotifyKind("tour"), "tour_request");
  assert.equal(leadNotifyKind("spot_inquiry"), "spot_request");
  assert.equal(leadNotifyKind("waitlist"), "waitlist_request");
  assert.match(leadReplyPreview("confirmed", "Elm Grove", "Tue 10am"), /Elm Grove/);
  assert.match(leadReplyPreview("confirmed", "Elm Grove", "Tue 10am"), /Tue 10am/);
  const files = ["src/lib/server/lead-requests.ts", "src/lib/lead-requests.ts", "src/lib/server/tours.ts", "src/lib/server/waitlist-api.ts"];
  for (const rel of files) {
    assert.doesNotMatch(src(rel), /gohighlevel|ghl\.|leadconnector/i, rel);
  }
});

test("copy keys exist in English and French", () => {
  const copy = src("src/lib/copy.ts");
  for (const key of [
    "myRequestsLead",
    "leadInbox",
    "leadKindTour",
    "leadKindWaitlist",
    "leadKindSpot",
    "leadStatusRequested",
    "leadStatusConfirmed",
    "goToMyRequests",
    "requestSentTrack",
  ]) {
    assert.equal(copy.split(`${key}:`).length >= 3, true, key);
  }
  assert.equal(leadKindCopyKey("spot_inquiry"), "leadKindSpot");
  assert.equal(leadStatusCopyKey("answered"), "leadStatusAnswered");
});

test("migration 0042 creates lead_requests and backfills existing sources", () => {
  const names = readdirSync(join(root, "migrations"));
  assert.ok(names.includes("0042_lead_requests.sql"));
  const mig = src("migrations/0042_lead_requests.sql");
  assert.match(mig, /create table if not exists lead_requests/);
  assert.match(mig, /tour.*waitlist.*spot_inquiry/s);
  assert.match(mig, /requested.*confirmed.*declined.*received.*answered.*closed/s);
  assert.match(mig, /from tour_requests/);
  assert.match(mig, /from bookings/);
  assert.match(mig, /from waitlist_interests/);
  assert.doesNotMatch(mig, /gohighlevel|leadconnector/i);
});

test("existing tour, spot, and waitlist writes also record a lead", () => {
  assert.match(src("src/lib/server/tours.ts"), /recordLeadRequest/);
  assert.match(src("src/lib/server/tours.ts"), /kind: "tour"/);
  assert.match(src("src/lib/server/family.ts"), /recordLeadRequest/);
  assert.match(src("src/lib/server/family.ts"), /kind: "spot_inquiry"/);
  assert.match(src("src/lib/server/family.ts"), /delete from lead_requests/);
  assert.match(src("src/lib/server/waitlist-api.ts"), /recordLeadRequest/);
  assert.match(src("src/lib/server/waitlist-api.ts"), /kind: "waitlist"/);
  assert.match(src("src/lib/server/waitlist-api.ts"), /closeWaitlistLead/);
});

test("parent My requests and daycare lead inbox are wired", () => {
  const parent = src("src/components/parent-desk.tsx");
  assert.match(parent, /listLeadRequests/);
  assert.match(parent, /ParentRequestsList/);
  assert.match(parent, /t\("myRequests"\)/);
  const inbox = src("src/components/daycare-lead-inbox.tsx");
  assert.match(inbox, /updateLeadRequest/);
  assert.match(inbox, /leadConfirm/);
  assert.match(inbox, /leadDecline/);
  assert.match(inbox, /leadAnswered/);
  assert.match(inbox, /leadReplyNote/);
  assert.match(src("src/routes/provider.tsx"), /DaycareLeadInbox/);
  assert.match(src("src/lib/desk-nav.ts"), /Lead inbox/);
  assert.match(src("src/lib/desk-nav.ts"), /My requests/);
});

test("listing CTAs deep-link ask= tour|spot|waitlist and land on My requests", () => {
  const listing = src("src/routes/daycare.$slug.tsx");
  assert.match(listing, /parseListingAsk/);
  assert.match(listing, /ask === "tour"/);
  assert.match(listing, /ask === "spot"/);
  assert.match(listing, /ask === "waitlist"/);
  assert.match(listing, /ask=tour/);
  assert.match(listing, /ask=waitlist/);
  assert.match(src("src/components/request-tour.tsx"), /PARENT_REQUESTS_SEARCH/);
  assert.match(src("src/components/request-spot.tsx"), /PARENT_REQUESTS_SEARCH/);
  assert.match(src("src/routes/book.\$slug.tsx"), /PARENT_REQUESTS_SEARCH/);
  assert.match(src("src/components/waitlist-opt-in.tsx"), /goToMyRequests/);
});

test("admin can see lead counts; no GHL and no FCM in this track PR", () => {
  const admin = src("src/routes/admin.tsx");
  assert.match(admin, /listAdminLeadCounts/);
  assert.match(admin, /Open leads/);
  const server = src("src/lib/server/lead-requests.ts");
  assert.match(server, /requireAdmin/);
  assert.match(server, /notifyPlatform/);
  assert.match(server, /notifyThreadParty/);
  assert.doesNotMatch(server, /gohighlevel|leadconnector|firebase|fcm|sendEachForMulticast/i);
  assert.doesNotMatch(src("src/lib/lead-requests.ts"), /FEATURE_PUSH|sendEachForMulticast/);
});
