import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PIPELINE,
  addStage,
  configureLostWorkflow,
  configureOfferWorkflow,
  conversionByStage,
  crmCanEdit,
  crmCanView,
  defaultCentreWorkflows,
  leadDedupeKey,
  monthlyCohort,
  planCentreWorkflows,
  planWorkflow,
  planWorkflowFamilyMail,
  renameStage,
  reorderStages,
  setWorkflowEnabled,
  sourceBreakdown,
  suggestForOpenSpot,
  timeInStageDays,
  waitlistPosition,
} from "../src/lib/centre-crm.ts";

test("a centre can rename, reorder, and add a step", () => {
  assert.equal(DEFAULT_PIPELINE[0].labelEn, "New inquiry");
  assert.equal(DEFAULT_PIPELINE[1].key, "contacted");
  const renamed = renameStage(DEFAULT_PIPELINE, "contacted", "Called", "Appelé");
  assert.equal(renamed.find((stage) => stage.key === "contacted")?.labelFr, "Appelé");
  const order = [...DEFAULT_PIPELINE.map((stage) => stage.key)].reverse();
  const flipped = reorderStages(DEFAULT_PIPELINE, order);
  assert.equal(flipped[0].key, "lost");
  const added = addStage(DEFAULT_PIPELINE, "Hold", "En attente");
  assert.equal(added.at(-1)?.key, "lost");
  assert.equal(added.some((stage) => stage.labelEn === "Hold"), true);
});

test("one family at one centre is one lead", () => {
  assert.equal(leadDedupeKey({ daycareId: "c1", parentUserId: "p1", email: "a@x.ca" }), "c1:parent:p1");
  assert.equal(
    leadDedupeKey({ daycareId: "c1", email: "A@x.ca" }),
    leadDedupeKey({ daycareId: "c1", email: "a@x.ca" }),
  );
});

test("read-only staff can view and cannot edit", () => {
  const staff = { role: "provider", centreRole: "read_only", sameCentre: true };
  assert.equal(crmCanView(staff), true);
  assert.equal(crmCanEdit(staff), false);
  assert.equal(crmCanEdit({ role: "provider", centreRole: "staff", sameCentre: true }), true);
  assert.equal(crmCanView({ role: "parent", centreRole: "owner", sameCentre: true }), false);
  assert.equal(crmCanView({ role: "government", centreRole: "owner", sameCentre: true }), false);
  assert.equal(crmCanView({ role: "admin", centreRole: null, sameCentre: true }), false);
  assert.equal(crmCanView({ role: "provider", centreRole: "owner", sameCentre: false }), false);
});

test("workflows suggest a tour, enrol an offer, and hold family mail", () => {
  const rules = [
    { kind: "stage_task", stageKey: "inquiry", enabled: true },
    { kind: "idle_notice", idleDays: 3, enabled: true },
    { kind: "tour_suggest", enabled: true },
    { kind: "offer_enrol", enabled: true },
    { kind: "family_message", stageKey: "contacted", enabled: true },
  ];
  assert.equal(planWorkflow(rules, { type: "entered_stage", stage: "inquiry" })?.action, "task");
  assert.equal(planWorkflow(rules, { type: "idle", idleDays: 2 }) , null);
  assert.equal(planWorkflow(rules, { type: "idle", idleDays: 4 })?.action, "in_app_notice");
  assert.deepEqual(planWorkflow(rules, { type: "tour_checked_in" }), { action: "suggest_stage", stage: "toured" });
  assert.equal(planWorkflow(rules, { type: "offer_accepted" })?.action, "move_stage");
  assert.deepEqual(
    planWorkflow(rules, { type: "entered_stage", stage: "contacted", casl: false, email: "a@kidease.ca" }, ["a@kidease.ca"]),
    { action: "hold_message", reason: "no_consent" },
  );
  assert.deepEqual(
    planWorkflow(rules, { type: "entered_stage", stage: "contacted", casl: true, email: "parent@example.com" }, ["a@kidease.ca"]),
    { action: "hold_message", reason: "not_allowlisted" },
  );
  assert.deepEqual(
    planWorkflow(rules, { type: "entered_stage", stage: "contacted", casl: true, email: "a@kidease.ca" }, ["a@kidease.ca"]),
    { action: "hold_message", reason: "no_customer_sends" },
  );
});

test("each centre workflow can be switched off on its own", () => {
  const at = "2026-11-01T15:00:00.000Z";
  const on = defaultCentreWorkflows();
  const inquiry = planCentreWorkflows(on, { type: "stage", stage: "inquiry", at, ownerUserId: "owner-1" });
  assert.equal(inquiry.some((item) => item.kind === "assign" && item.userId === "owner-1"), true);
  assert.equal(inquiry.some((item) => item.kind === "task" && item.key === "inquiry_reply" && item.dueAt === "2026-11-02T15:00:00.000Z"), true);
  assert.equal(inquiry.some((item) => item.kind === "task" && item.key === "inquiry_idle"), true);
  assert.equal(planCentreWorkflows(setWorkflowEnabled(on, "inquiry", false), { type: "stage", stage: "inquiry", at }).length, 0);

  const tour = planCentreWorkflows(on, { type: "stage", stage: "tour_booked", at, tourAt: "2026-11-05T15:00:00.000Z" });
  assert.equal(tour[0].kind === "task" && tour[0].dueAt, "2026-11-04T15:00:00.000Z");
  const follow = planCentreWorkflows(on, { type: "stage", stage: "toured", at });
  assert.equal(follow[0].kind === "task" && follow[0].key, "tour_follow");
  const missed = planCentreWorkflows(on, { type: "tour_no_show", at });
  assert.equal(missed[0].kind === "move" && missed[0].stage, "contacted");
  assert.equal(planCentreWorkflows(setWorkflowEnabled(on, "tour", false), { type: "tour_no_show", at }).length, 0);

  const application = planCentreWorkflows(on, { type: "stage", stage: "applied", at });
  assert.equal(application.some((item) => item.kind === "task" && item.key === "application_docs"), true);
  assert.equal(application.some((item) => item.kind === "task" && item.key === "application_review"), true);

  const offered = configureOfferWorkflow(on, { offerDays: 3, expiryGoesTo: "waitlisted" });
  const offer = planCentreWorkflows(offered, { type: "stage", stage: "offered", at });
  assert.equal(offer.some((item) => item.kind === "task" && item.key === "offer_expires" && item.dueAt === "2026-11-04T15:00:00.000Z"), true);
  const expired = planCentreWorkflows(offered, { type: "offer_expired", at });
  assert.deepEqual(expired[0], { kind: "move", stage: "waitlisted", lostReason: undefined });
  const accepted = planCentreWorkflows(on, { type: "offer_accepted", at });
  assert.equal(accepted.some((item) => item.kind === "move" && item.stage === "enrolled"), true);
  const checklist = accepted.find((item) => item.kind === "checklist");
  assert.equal(checklist?.kind === "checklist" && checklist.items.map((item) => item.key).join(","), "enrol_forms,enrol_allergies,enrol_pickup,enrol_start");

  const people = [
    { id: "later", joinedAt: "2026-02-01", ageGroup: "toddler", roomWanted: "toddler", schedule: "full", siblings: 0 },
    { id: "sib", joinedAt: "2026-03-01", ageGroup: "toddler", roomWanted: "toddler", schedule: "full", siblings: 1 },
    { id: "infant", joinedAt: "2026-01-01", ageGroup: "infant", roomWanted: "infant", schedule: "full", siblings: 2 },
  ];
  assert.equal(waitlistPosition(people, "later"), 2);
  assert.deepEqual(suggestForOpenSpot(people, { ageGroup: "toddler", room: "toddler", schedule: "full" }).map((person) => person.id), ["sib", "later"]);
  const spot = planCentreWorkflows(on, { type: "spot_opened", at, people, ageGroup: "toddler", room: "toddler", schedule: "full" });
  assert.deepEqual(spot[0], { kind: "suggest", leadIds: ["sib", "later"] });
  assert.equal(planCentreWorkflows(on, { type: "stage", stage: "waitlisted", at })[0].kind, "task");

  assert.deepEqual(planCentreWorkflows(on, { type: "stage", stage: "lost", at, lostReason: "" }), [{ kind: "block", reason: "lost_reason" }]);
  assert.equal(planCentreWorkflows(on, { type: "stage", stage: "lost", at, lostReason: "chose_other" }).length, 0);
  const reengage = planCentreWorkflows(configureLostWorkflow(on, true), { type: "stage", stage: "lost", at, lostReason: "chose_other" });
  assert.equal(reengage[0].kind === "task" && reengage[0].dueAt, "2027-01-30T15:00:00.000Z");

  const enrolled = planCentreWorkflows(on, { type: "stage", stage: "enrolled", at });
  assert.equal(enrolled.some((item) => item.kind === "task" && item.key === "enrolled_week"), true);
  assert.equal(enrolled.some((item) => item.kind === "task" && item.key === "enrolled_month"), true);
  assert.equal(enrolled.some((item) => item.kind === "hold_message"), true);
  assert.equal(planCentreWorkflows(setWorkflowEnabled(on, "enrolled", false), { type: "stage", stage: "enrolled", at }).length, 0);
});

test("workflow mail uses the send gate and does not text families", () => {
  const held = planWorkflowFamilyMail({
    template: "still_interested",
    channel: "email",
    feature: "CRM-FAMILY",
    recipient: "a@kidease.ca",
    sender: "hello@kidease.ca",
    allowlist: ["a@kidease.ca"],
    occurredAt: "2026-11-02T00:00:00.000Z",
    enabledAt: "2026-11-01T00:00:00.000Z",
  });
  assert.equal(held.kind, "hold_message");
  const sms = planWorkflowFamilyMail({
    template: "offer_reminder",
    channel: "sms",
    feature: "ADM-08",
    recipient: "a@kidease.ca",
    sender: "hello@kidease.ca",
    allowlist: ["a@kidease.ca"],
    occurredAt: "2026-11-02T00:00:00.000Z",
    enabledAt: "2026-11-01T00:00:00.000Z",
  });
  assert.deepEqual(sms, { kind: "hold_message", template: "offer_reminder", reason: "held_channel" });
  const allowed = planWorkflowFamilyMail({
    template: "review_request",
    channel: "email",
    feature: "ADM-08",
    recipient: "a@kidease.ca",
    sender: "hello@kidease.ca",
    allowlist: ["a@kidease.ca"],
    occurredAt: "2026-11-02T00:00:00.000Z",
    enabledAt: "2026-11-01T00:00:00.000Z",
  });
  assert.deepEqual(allowed, { kind: "template_message", template: "review_request" });
});

test("analytics use the families already on the board", () => {
  const leads = [
    { id: "1", stage: "enrolled", source: "tour", startedAt: "2026-10-02T00:00:00.000Z", lastActivityAt: "2026-10-20T00:00:00.000Z" },
    { id: "2", stage: "inquiry", source: "tour", startedAt: "2026-10-08T00:00:00.000Z", lastActivityAt: "2026-10-08T00:00:00.000Z" },
    { id: "3", stage: "inquiry", source: "phone", startedAt: "2026-11-01T00:00:00.000Z", lastActivityAt: "2026-11-01T00:00:00.000Z" },
  ];
  const stages = conversionByStage(leads, DEFAULT_PIPELINE);
  assert.equal(stages.find((row) => row.key === "inquiry")?.count, 2);
  assert.equal(stages.find((row) => row.key === "enrolled")?.count, 1);
  assert.equal(timeInStageDays("2026-10-01T00:00:00.000Z", "2026-10-03T00:00:00.000Z"), 2);
  assert.deepEqual(sourceBreakdown(leads).find((row) => row.source === "tour"), { source: "tour", count: 2 });
  const months = monthlyCohort(leads);
  assert.equal(months[0].month, "2026-10");
  assert.equal(months[0].enrolled, 1);
  assert.equal(months[0].rate, 0.5);
});
