import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PIPELINE,
  addStage,
  conversionByStage,
  crmCanEdit,
  crmCanView,
  leadDedupeKey,
  monthlyCohort,
  planWorkflow,
  renameStage,
  reorderStages,
  sourceBreakdown,
  timeInStageDays,
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
