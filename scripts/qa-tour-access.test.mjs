import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { isQaTourCentre, qaTourEmailAllowed, qaTourSlotPlan } from "../src/lib/qa-tour-access.ts";

function page(rel) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

test("only the QA allowlist may book the hidden centre", () => {
  assert.equal(isQaTourCentre({ id: "qa-reviewer-demo" }), true);
  assert.equal(isQaTourCentre({ slug: "qa-reviewer-demo-centre" }), true);
  assert.equal(isQaTourCentre({ slug: "some-real-centre" }), false);
  assert.equal(qaTourEmailAllowed("e2e-parent@kidease.test"), true);
  assert.equal(qaTourEmailAllowed("e2e-provider@kidease.test"), true);
  assert.equal(qaTourEmailAllowed("parent@example.com"), false);
  assert.equal(qaTourEmailAllowed(""), false);
  assert.equal(qaTourEmailAllowed(null), false);
});

test("slots are weekday mornings and the centre stays hidden", () => {
  const slots = qaTourSlotPlan(new Date("2026-11-09T15:00:00.000Z"));
  assert.equal(slots.length, 4);
  assert.equal(slots[0].startTime, "10:00");
  assert.equal(slots[0].endTime, "10:30");
  assert.equal(slots[0].capacity, 2);
  for (const slot of slots) {
    const day = new Date(`${slot.date}T12:00:00.000Z`).getUTCDay();
    assert.notEqual(day, 0);
    assert.notEqual(day, 6);
  }
  const migration = page("../migrations/0186_qa_tour_slots.sql");
  assert.match(migration, /qa-reviewer-demo/);
  assert.doesNotMatch(migration, /visibility\s*=\s*'public'/);
  const book = page("../src/lib/server/tour-calendar.ts");
  assert.match(book, /qaTourEmailAllowed/);
  assert.match(book, /if \(quiet\) return \{ id: tourId/);
  const request = page("../src/lib/server/tours.ts");
  assert.match(request, /isQaTourCentre/);
});
