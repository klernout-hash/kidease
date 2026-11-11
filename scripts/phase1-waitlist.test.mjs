import assert from "node:assert/strict";
import { test } from "node:test";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import {
  ageAtStartBand,
  canCreateLead,
  manualReorderAllowed,
  nextFormStatus,
  offerNotice,
  parentSeesOwnWaitlist,
  positionBand,
  resolveOffer,
  sameProgram,
  sortWaitlist,
  suggestLeadMerge,
} from "../src/lib/phase1-waitlist.ts";

test("only admissions staff create leads, and consent is a separate flag", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_WALKIN_LEADS, false);
  assert.equal(canCreateLead("staff"), false);
  assert.equal(canCreateLead("admissions"), true);
  assert.equal(canCreateLead("owner"), true);
  assert.equal(suggestLeadMerge([{ email: "A@B.ca", phone: "" }], "a@b.ca", ""), true);
  assert.equal(suggestLeadMerge([], "new@b.ca", "2045550100"), false);
});

test("waitlist bands and policy order stay deterministic", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_PROGRAM_WAITLIST, false);
  assert.equal(positionBand(0), "1-5");
  assert.equal(positionBand(7), "6-20");
  assert.equal(positionBand(30), "21+");
  const rows = [
    { id: "b", joinedAt: "2026-02-01", sibling: false, staffChild: true },
    { id: "a", joinedAt: "2026-01-01", sibling: true, staffChild: false },
    { id: "c", joinedAt: "2026-01-15", sibling: false, staffChild: false },
  ];
  const ordered = sortWaitlist(rows, ["sibling", "staff_child"]).map((row) => row.id);
  assert.deepEqual(ordered, ["a", "b", "c"]);
  assert.equal(manualReorderAllowed("  "), false);
  assert.equal(manualReorderAllowed("sibling already enrolled"), true);
  assert.equal(parentSeesOwnWaitlist("p1", "p2"), false);
  assert.equal(ageAtStartBand("2024-01-31", "2026-01-31"), "toddler");
  assert.equal(ageAtStartBand(null, "2026-01-31"), "unknown");
  assert.equal(sameProgram("infant", "infant"), true);
  assert.equal(sameProgram("", "infant"), false);
  assert.equal(sameProgram("toddler", null), true);
  assert.equal(canCreateLead("parent"), false);
  assert.equal(canCreateLead("billing"), false);
});

test("two accepts on the last spot cannot both enrol", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_WAITLIST_OFFERS, false);
  const first = resolveOffer({
    now: new Date("2026-11-11T15:00:00.000Z"),
    expiresAt: "2026-11-14T15:00:00.000Z",
    timeZone: "America/Winnipeg",
    decision: "accept",
    spotsAvailable: 1,
    alreadyResolved: false,
  });
  assert.equal(first.enrolled, true);
  const second = resolveOffer({
    now: new Date("2026-11-11T15:00:01.000Z"),
    expiresAt: "2026-11-14T15:00:00.000Z",
    timeZone: "America/Winnipeg",
    decision: "accept",
    spotsAvailable: 0,
    alreadyResolved: false,
  });
  assert.equal(second.reason, "no_spot");
  assert.equal(second.enrolled, false);
  const expired = resolveOffer({
    now: new Date("2026-11-14T16:00:00.000Z"),
    expiresAt: "2026-11-14T15:00:00.000Z",
    timeZone: "America/Winnipeg",
    decision: "accept",
    spotsAvailable: 1,
    alreadyResolved: false,
  });
  assert.equal(expired.outcome, "expired");
  const notice = offerNotice({
    flagOn: true,
    enabledAt: "2026-11-01T00:00:00.000Z",
    sentAt: "2026-11-11T15:00:00.000Z",
    alreadySent: true,
    quiet: false,
    caslOk: false,
  });
  assert.equal(notice.deliver, false);
  assert.equal(notice.reason, "duplicate");
});

test("form status moves forward from events and a reject notifies only as a hold", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_FORM_STATUS, false);
  assert.equal(nextFormStatus("sent", "view"), "viewed");
  assert.equal(nextFormStatus("submitted", "view"), "submitted");
  assert.equal(nextFormStatus("submitted", "reject"), "rejected");
  assert.equal(nextFormStatus("approved", "reject"), "approved");
});
