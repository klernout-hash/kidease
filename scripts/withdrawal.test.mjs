import assert from "node:assert/strict";
import { test } from "node:test";
import { planWithdrawal, withdrawalEnabled, withdrawalMode } from "../src/lib/wiring/withdrawal.ts";

test("withdrawal keeps the centre notice period and does not invent a fee", () => {
  assert.equal(withdrawalEnabled({}), false);
  assert.equal(withdrawalMode({ FEATURE_WITHDRAWAL: "1" }), "dry_run");
  assert.equal(planWithdrawal({
    noticeDays: null,
    requestedOn: "2026-11-01",
    lastDay: "2026-12-01",
    feeCents: 1000,
    spotsTracked: true,
  }).ok, false);
  const early = planWithdrawal({
    noticeDays: 14,
    requestedOn: "2026-11-01",
    lastDay: "2026-11-10",
    feeCents: 1000,
    spotsTracked: true,
  });
  assert.equal(early.ok, false);
  const ready = planWithdrawal({
    noticeDays: 14,
    requestedOn: "2026-11-01",
    lastDay: "2026-11-20",
    feeCents: null,
    spotsTracked: false,
  });
  assert.equal(ready.ok, true);
  if (!ready.ok) return;
  assert.equal(ready.invoiceCents, null);
  assert.equal(ready.alertWaitlist, false);
  const tracked = planWithdrawal({
    noticeDays: 14,
    requestedOn: "2026-11-01",
    lastDay: "2026-11-20",
    feeCents: 0,
    spotsTracked: true,
  });
  assert.equal(tracked.ok && tracked.invoiceCents, 0);
  assert.equal(tracked.ok && tracked.alertWaitlist, true);
});
