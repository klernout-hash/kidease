import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { asIsoString, compareTimeDesc, sortTime } from "../src/lib/sort-time.ts";
import { assignPipeline } from "../src/lib/crm-pipeline.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("old submittedAt localeCompare throws on Date (the production crash)", () => {
  const t = { submittedAt: new Date("2026-09-08T12:00:00.000Z") };
  assert.throws(() => (t.submittedAt || "").localeCompare(""), TypeError);
});

test("sortTime and compareTimeDesc accept Date, number, string, and null", () => {
  const newer = new Date("2026-09-08T12:00:00.000Z");
  const olderIso = "2026-01-01T00:00:00.000Z";
  assert.ok(sortTime(newer) > sortTime(olderIso));
  assert.ok(sortTime(newer.getTime()) > 0);
  assert.equal(sortTime(null), 0);
  assert.equal(sortTime(undefined), 0);
  assert.equal(sortTime(""), 0);
  assert.equal(sortTime("not-a-date"), 0);

  const rows = [
    { submittedAt: olderIso },
    { submittedAt: newer },
    { submittedAt: null },
    { submittedAt: 1_720_000_000_000 },
  ];
  assert.doesNotThrow(() => {
    rows.sort((a, b) => compareTimeDesc(a.submittedAt, b.submittedAt));
  });
  assert.equal(rows[0].submittedAt, newer);
  assert.equal(rows[rows.length - 1].submittedAt, null);
});

test("asIsoString normalizes Date and leaves strings", () => {
  assert.equal(asIsoString(new Date("2026-09-08T12:00:00.000Z")), "2026-09-08T12:00:00.000Z");
  assert.equal(asIsoString("2026-01-01T00:00:00.000Z"), "2026-01-01T00:00:00.000Z");
  assert.equal(asIsoString(null), null);
  assert.equal(asIsoString(""), null);
});

test("admin queue and verify sorts no longer localeCompare submittedAt", () => {
  const admin = src("src/routes/admin.tsx");
  const server = src("src/lib/server/admin-centres.ts");
  const money = src("src/lib/server/admin-money.ts");
  const pipeline = src("src/lib/crm-pipeline.ts");
  for (const text of [admin, server, money, pipeline]) {
    assert.doesNotMatch(text, /submittedAt \|\| ""\)\.localeCompare/);
    assert.doesNotMatch(text, /updatedAt \|\| ""\)\.localeCompare/);
    assert.doesNotMatch(text, /createdAt\.localeCompare/);
  }
  assert.match(admin, /compareTimeDesc\(a\.submittedAt, b\.submittedAt\)/);
  assert.match(server, /asIsoString\(r\.submitted_at\)/);
  assert.match(server, /compareTimeDesc\(a\.submittedAt, b\.submittedAt\)/);
  assert.match(money, /compareTimeDesc\(a\.createdAt, b\.createdAt\)/);
  assert.match(pipeline, /compareTimeDesc\(a\.updatedAt, b\.updatedAt\)/);
});

test("centre pipeline still sorts newest first when updatedAt is a Date", () => {
  const cards = assignPipeline([
    {
      id: "old",
      kind: "conversation",
      daycareId: "d1",
      daycareName: "Bright",
      parentUserId: "p-old",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: "new",
      kind: "conversation",
      daycareId: "d1",
      daycareName: "Bright",
      parentUserId: "p-new",
      updatedAt: new Date("2026-09-08T00:00:00.000Z"),
    },
  ]);
  assert.equal(cards[0].id, "new");
  assert.equal(cards[1].id, "old");
});
