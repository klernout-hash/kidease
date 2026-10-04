import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  auditRowsForOffer,
  fairOfferOrder,
  placeInLine,
  respondToOffer,
  sendSpotToFamily,
  waitlistAuditCsv,
} from "../src/lib/spot-offers.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const now = Date.parse("2026-10-03T15:00:00.000Z");

function entry(id, extra = {}) {
  return {
    id,
    daycareId: "d1",
    userId: id,
    ageGroup: "toddler",
    status: "waiting",
    joinedAt: "2026-09-01T12:00:00.000Z",
    sibling: false,
    startDate: null,
    ...extra,
  };
}

test("offer order follows sibling, age, start date, then sign-up", () => {
  const rows = [
    entry("early", { joinedAt: "2026-08-01T12:00:00.000Z", startDate: "2026-12-01" }),
    entry("sib", { joinedAt: "2026-09-20T12:00:00.000Z", sibling: true, startDate: "2026-11-01" }),
    entry("soon", { joinedAt: "2026-09-15T12:00:00.000Z", startDate: "2026-10-20" }),
    entry("infant", { ageGroup: "infant", joinedAt: "2026-07-01T12:00:00.000Z", startDate: "2026-10-01" }),
  ];
  const off = fairOfferOrder(rows, { siblingPriority: false, spotAge: "toddler" });
  assert.deepEqual(
    off.map((row) => row.id),
    ["soon", "sib", "early", "infant"],
  );
  const on = fairOfferOrder(rows, { siblingPriority: true, spotAge: "toddler" });
  assert.equal(on[0].id, "sib");
  assert.equal(placeInLine(rows, "early"), 2);
  const csv = waitlistAuditCsv(auditRowsForOffer(rows, { siblingPriority: true, spotAge: "toddler" }));
  assert.match(csv, /^place,entry_id,sibling,age,start_date,joined_at/);
  assert.match(csv, /sib/);
  assert.doesNotMatch(csv, /@|child|email|phone/i);
});

test("a sibling toggle moves the next offer, and join order stays without it", () => {
  const nextId = () => "so";
  const plain = {
    entries: [
      entry("a", { joinedAt: "2026-10-01T12:00:00.000Z" }),
      entry("b", { joinedAt: "2026-10-02T12:00:00.000Z", sibling: true }),
    ],
    offers: [],
  };
  const first = sendSpotToFamily(plain, "a", now, nextId);
  const declined = respondToOffer(first.state, first.createdOffers[0].id, "decline", now + 1000, () => "so2");
  assert.equal(declined.createdOffers.at(-1)?.userId, "b");

  const preferred = {
    entries: [
      entry("a", { joinedAt: "2026-10-01T12:00:00.000Z" }),
      entry("b", { joinedAt: "2026-10-02T12:00:00.000Z", sibling: true }),
    ],
    offers: [],
    siblingPriority: true,
  };
  const sent = sendSpotToFamily(preferred, "a", now, () => "so3");
  const next = respondToOffer(sent.state, sent.createdOffers[0].id, "decline", now + 1000, () => "so4");
  assert.equal(next.createdOffers.at(-1)?.userId, "b");
  const skipped = {
    ...preferred,
    entries: preferred.entries.map((row) => ({ ...row })),
  };
  const direct = respondToOffer(
    {
      entries: skipped.entries,
      offers: [
        {
          id: "open1",
          waitlistId: "a",
          daycareId: "d1",
          userId: "a",
          ageGroup: "toddler",
          status: "open",
          offeredAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 48 * 60 * 60 * 1000).toISOString(),
        },
      ],
      siblingPriority: true,
    },
    "open1",
    "decline",
    now + 1000,
    () => "so5",
  );
  assert.equal(direct.createdOffers.at(-1)?.userId, "b");
  const server = readFileSync(join(root, "src/lib/server/spot-offers.ts"), "utf8");
  assert.match(server, /exportCentreWaitlistAudit/);
  assert.match(server, /sibling_priority/);
  assert.match(readFileSync(join(root, "migrations/0082_waitlist_fairness.sql"), "utf8"), /waitlist_audit/);
  assert.doesNotMatch(readFileSync(join(root, "migrations/0082_waitlist_fairness.sql"), "utf8"), /fee_cents|waitlist_fee/);
});
