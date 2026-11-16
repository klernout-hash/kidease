import { test } from "node:test";
import assert from "node:assert/strict";
import { earningsSummary } from "../src/lib/bill.ts";

const now = new Date("2026-11-16T12:00:00Z");

test("owed is sent bills; paid is this month's paid bills, net", () => {
  const s = earningsSummary(
    [
      { status: "sent", amountCents: 50000, netCents: 48500, paidAt: null },
      { status: "sent", amountCents: 20000, netCents: 19400, paidAt: null },
      { status: "draft", amountCents: 10000, netCents: 9700, paidAt: null },
      { status: "paid", amountCents: 30000, netCents: 29100, paidAt: "2026-11-02T10:00:00Z" },
      { status: "paid", amountCents: 30000, netCents: 29100, paidAt: "2026-10-30T10:00:00Z" },
      { status: "void", amountCents: 99999, netCents: 99999, paidAt: null },
    ],
    now,
  );
  assert.deepEqual(s, { owedCents: 70000, owedCount: 2, paidThisMonthCents: 29100, draftCount: 1 });
});

test("no bills gives zeros", () => {
  assert.deepEqual(earningsSummary([], now), { owedCents: 0, owedCount: 0, paidThisMonthCents: 0, draftCount: 0 });
});
