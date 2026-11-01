import assert from "node:assert/strict";
import { test } from "node:test";
import { escalationDue, escalationVisible, escalationsEnabled, parseSlaHours } from "../src/lib/wiring/escalations.ts";

test("escalation uses a stored clock and shows status to the people involved", () => {
  assert.equal(escalationsEnabled({}), false);
  assert.equal(parseSlaHours(0), null);
  assert.equal(escalationDue({
    openedAt: "2026-10-01T12:00:00.000Z",
    slaHours: null,
    now: "2026-10-03T12:00:00.000Z",
    resolved: false,
  }), false);
  assert.equal(escalationDue({
    openedAt: "2026-10-01T12:00:00.000Z",
    slaHours: 24,
    now: "2026-10-02T12:00:00.000Z",
    resolved: false,
  }), true);
  assert.equal(escalationDue({
    openedAt: "2026-10-01T12:00:00.000Z",
    slaHours: 24,
    now: "2026-10-02T12:00:00.000Z",
    resolved: true,
  }), false);
  assert.equal(escalationVisible({ role: "admin", parties: [], userId: "a", isParty: false }), true);
  assert.equal(escalationVisible({ role: "parent", parties: [], userId: "p", isParty: false }), false);
});
