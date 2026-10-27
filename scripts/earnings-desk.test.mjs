import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { statementPdf } from "../src/lib/earnings-pdf.ts";
import {
  billsCsv,
  filterBills,
  maskEmail,
  payoutReference,
  shapeBill,
  shapeEarningsDesk,
} from "../src/lib/earnings-desk.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");
const now = new Date(2026, 9, 15, 12, 0, 0);

const paid = {
  id: "paid-1",
  status: "paid",
  grossCents: 5000,
  feeCents: 100,
  netCents: 4900,
  period: "2026-10",
  paidAt: "2026-10-02",
  dueAt: null,
  payoutOn: null,
  parentName: "Alex Parent",
  parentImage: "https://cdn.example/a.jpg",
  childName: "Rowan",
  number: "KE-10",
  centreName: "North Elm",
  centrePhoto: "https://cdn.example/centre.jpg",
  listingId: "north",
  payoutRef: "po_123",
  programStart: "2026-09-01",
  receiptUrl: "https://pay.stripe.com/receipts/abc",
  items: [{ id: "line-1", description: "October care", cents: 5000 }],
};

test("earnings hide empty months and never invent tax or a bank number", () => {
  assert.equal(payoutReference("acct_123", "internal-id"), null);
  assert.equal(payoutReference("po_123"), "po_123");
  assert.equal(maskEmail("alex@example.com"), "a•••@example.com");
  const desk = shapeEarningsDesk(
    {
      aggregates: [
        { period: "2026-10", status: "paid", netCents: 4900, grossCents: 5000, feeCents: 100 },
        { period: "2026-10", status: "sent", netCents: 2000, grossCents: 2200, feeCents: 200 },
        { period: "2026-08", status: "paid", netCents: 800, grossCents: 800, feeCents: 0 },
      ],
      bills: [
        paid,
        {
          ...paid,
          id: "sent-1",
          status: "sent",
          grossCents: 2200,
          feeCents: 200,
          netCents: 2000,
          paidAt: null,
          dueAt: "2026-10-20",
          payoutRef: "not-a-bank",
          number: "KE-11",
          items: [],
        },
      ],
      facts: { "2026-10": { days: 12, children: 2, tours: 1 } },
      payouts: "on",
      maskedEmail: "a•••@example.com",
      truncated: false,
    },
    now,
  );
  assert.equal(desk.thisMonthPaidCents, 4900);
  assert.equal(desk.thisMonthUpcomingCents, 2000);
  assert.equal(desk.thisMonthTotalCents, 6900);
  const september = desk.bars.find((bar) => bar.period === "2026-09");
  assert.equal(september?.paidCents, null);
  assert.equal(september?.upcomingCents, null);
  assert.equal(desk.paid.length, 1);
  assert.equal(desk.upcoming.length, 1);
  assert.equal(desk.upcoming[0]?.payoutRef, null);
  const october = desk.statements.find((item) => item.period === "2026-10");
  assert.equal(october?.isNew, true);
  assert.equal(october?.taxCents, null);
  assert.equal(october?.adjustmentCents, null);
  assert.equal(october?.daysAttended, 12);
  assert.equal(october?.feeCents, 300);
  assert.equal(october?.listings.length, 1);
  const fee = desk.paid[0]?.lines.find((line) => line.kind === "fee");
  assert.equal(fee?.cents, -100);
  assert.equal(desk.statements.some((item) => item.taxCents != null), false);
  const hidden = shapeEarningsDesk({ aggregates: [], bills: [], facts: null, payouts: "unknown", maskedEmail: null, truncated: false }, now);
  assert.equal(hidden.thisMonthTotalCents, null);
  assert.equal(hidden.statements.length, 0);
  assert.equal(hidden.statements[0]?.daysAttended, undefined);
});

test("filters, csv, and parent bills stay on real amounts", () => {
  const bill = shapeBill(paid, "centre");
  assert.ok(bill);
  const parent = shapeBill(paid, "parent");
  assert.equal(parent?.feeCents, null);
  assert.equal(parent?.netCents, 5000);
  assert.equal(parent?.lines.some((line) => line.kind === "fee"), false);
  assert.equal(shapeBill({ ...paid, status: "sent" }, "parent"), null);
  const rows = filterBills([bill], { dates: "this-month", listingId: "north", type: "tuition" }, now);
  assert.equal(rows.length, 1);
  assert.equal(filterBills([bill], { dates: "last-month", listingId: null, type: "all" }, now).length, 0);
  const csv = billsCsv([bill], "netCents");
  assert.match(csv, /4900/);
  assert.doesNotMatch(csv, /po_123|bank|last4/i);
  const pdf = new TextDecoder().decode(statementPdf(["KidEase", "CA$49.00"]));
  assert.match(pdf, /%PDF-1.1/);
  assert.match(pdf, /CA\$49.00/);
  assert.doesNotMatch(pdf, /GST|HST|PST/);
});

test("earnings screens do not link to plans", () => {
  const files = [
    "src/components/host-earnings-screen.tsx",
    "src/components/earnings-payouts.tsx",
    "src/components/earnings-bars.tsx",
    "src/components/earnings-details.tsx",
    "src/components/earnings-list.tsx",
    "src/components/earnings-bill-sheet.tsx",
    "src/lib/server/earnings-desk.ts",
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /\/plans|\/pricing|navUpgrade|Upgrade/);
  }
  const hub = read("src/components/host-earnings-screen.tsx");
  assert.match(hub, /data-ke="host-earnings"/);
  assert.match(hub, /data-ke="earnings-performance"/);
  assert.match(hub, /KidBlocks/);
  assert.match(hub, /CountUp/);
  assert.match(read("src/routes/menu.tsx"), /loadEarningsDesk/);
  assert.match(read("src/components/earnings-details.tsx"), /data-ke="earnings-details"/);
  assert.match(read("src/components/earnings-list.tsx"), /data-ke="earnings-export"/);
  assert.match(read("src/components/earnings-bill-sheet.tsx"), /data-ke="earnings-lines"/);
});
