import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ATTENTION_HISTORY_MS,
  parentAttentionFacts,
  providerAttentionFacts,
  readAttentionDismissals,
  splitAttention,
  writeAttentionDismissal,
} from "../src/lib/attention-list.ts";

const now = Date.parse("2026-11-16T12:00:00.000Z");

test("parent items open, expire, and leave after they are resolved", () => {
  const facts = parentAttentionFacts({
    tours: [{ id: "t1", daycareId: "c1", daycareName: "Elm", status: "accepted" }],
    offers: [
      { id: "o1", daycareId: "c1", daycareName: "Elm", status: "open", expiresAt: "2026-11-17T12:00:00.000Z" },
      { id: "o2", daycareId: "c2", daycareName: "Oak", status: "open", expiresAt: "2026-11-15T12:00:00.000Z" },
    ],
    bills: [
      { id: "b1", daycareId: "c1", daycareName: "Elm", number: "KE-1", status: "sent", dueAt: "2026-11-20T00:00:00.000Z" },
      { id: "b2", daycareId: "c1", daycareName: "Elm", number: "KE-2", status: "paid", paidAt: "2026-11-10T00:00:00.000Z" },
    ],
  });
  const buckets = splitAttention(facts, { now });
  assert.deepEqual(
    buckets.open.map((row) => row.id),
    ["offer:o1", "bill:b1", "tour:t1"],
  );
  assert.equal(buckets.done.some((row) => row.id === "offer:o2"), true);
  assert.equal(buckets.done.some((row) => row.id === "bill:b2"), true);
  const dismissed = splitAttention(facts, {
    now,
    dismissed: [{ id: "tour:t1", at: "2026-11-16T11:00:00.000Z" }],
  });
  assert.equal(dismissed.open.some((row) => row.id === "tour:t1"), false);
  assert.equal(dismissed.done.some((row) => row.id === "tour:t1"), true);
});

test("provider items stay inside the centre and drop after 30 days", () => {
  const facts = providerAttentionFacts({
    now,
    requests: [
      { id: "r1", daycareId: "c1", title: "Ada", status: "requested" },
      { id: "r2", daycareId: "c1", title: "Bea", status: "confirmed", respondedAt: "2026-10-01T00:00:00.000Z" },
    ],
    bills: [{ id: "b1", daycareId: "c1", title: "KE-9", status: "sent", dueAt: "2026-11-01T00:00:00.000Z" }],
    messages: [{ id: "m1", daycareId: "c9", title: "Other centre", unread: true }],
  });
  const buckets = splitAttention(facts, { now });
  assert.deepEqual(buckets.open.map((row) => row.id).sort(), ["centre-message:m1", "overdue:b1", "request:r1"]);
  assert.equal(buckets.open.every((row) => row.role === "provider"), true);
  assert.equal(buckets.done.some((row) => row.id === "request:r2"), false);
  assert.ok(now - Date.parse("2026-10-01T00:00:00.000Z") > ATTENTION_HISTORY_MS);
});

test("dismissals are stored per person", () => {
  const raw = writeAttentionDismissal(null, "user-a", "tour:t1", "2026-11-16T00:00:00.000Z");
  assert.deepEqual(readAttentionDismissals(raw, "user-a"), [{ id: "tour:t1", at: "2026-11-16T00:00:00.000Z" }]);
  assert.deepEqual(readAttentionDismissals(raw, "user-b"), []);
});

test("the list is on the parent home and the provider Today desk", () => {
  const parent = readFileSync(new URL("../src/components/parent-desk.tsx", import.meta.url), "utf8");
  const today = readFileSync(new URL("../src/components/today-urgency-home.tsx", import.meta.url), "utf8");
  assert.match(parent, /ParentAttention/);
  assert.match(today, /ProviderAttention/);
  assert.match(parent, /childIds=/);
  assert.match(readFileSync(new URL("../src/components/attention-list.tsx", import.meta.url), "utf8"), /listCentreWaitlist/);
  assert.match(readFileSync(new URL("../src/components/attention-list.tsx", import.meta.url), "utf8"), /listChildAgreements/);
  assert.match(readFileSync(new URL("../src/lib/copy-fr.ts", import.meta.url), "utf8"), /attentionTitle: "À faire"/);
});
