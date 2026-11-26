import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  GOV_PAGES,
  broadcastDraftOk,
  broadcastTargets,
  changeTransition,
  changeView,
  feeOverCap,
  incidentClock,
  screeningTally,
  shownCount,
  suppressedCsv,
} from "../src/lib/gov/desk.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const DESK_LEAVES = [
  "change-requests", "incidents", "complaints", "complaint-updates", "ratios", "screening", "compliance",
  "fee-caps", "escalations", "inspection-sync", "funding", "demand", "vacancies", "subsidy", "centres",
  "broadcasts", "notifications", "claim-notices", "audit", "data-requests", "settings",
];

test("every desk page is behind the government sign-in in English and French", () => {
  for (const leaf of [...DESK_LEAVES, "exports"]) {
    for (const file of [`src/routes/gov_.${leaf}.tsx`, `src/routes/fr.gov_.${leaf}.tsx`]) {
      const src = read(file);
      assert.match(src, /beforeLoad: \(\{ context \}\) => guardGovDesk\("(en|fr)"/, file);
      assert.match(src, /govRobotsHeaders/, file);
      assert.match(src, /GovNativeNote/, file);
      assert.doesNotMatch(src, /redirect\(/, `${file} is a real page, not a redirect`);
    }
  }
});

test("every desk server call needs the government middleware (parents and daycares are refused)", () => {
  const src = read("src/lib/server/gov-desk.ts");
  const calls = src.split("createServerFn(").slice(1);
  assert.ok(calls.length >= 10);
  for (const call of calls) assert.match(call.slice(0, 120), /^\{ method: "(GET|POST)" \}\)\n\s+\.middleware\(\[govAuthMiddleware\]\)/);
  assert.doesNotMatch(src, /authMiddleware\b(?<!govAuthMiddleware)/);
  const middleware = read("src/lib/auth/gov-middleware.ts");
  assert.match(middleware, /requireGovActor/);
  assert.match(middleware, /assertGovSecondFactorVerified/);
  const actor = read("src/lib/server/gov-actor.server.ts");
  assert.match(actor, /if \(String\(row\.role\) !== "government"\) return null;/);
});

test("writes check read-only and demo accounts, and log to the audit trail", () => {
  const src = read("src/lib/server/gov-desk.ts");
  for (const fn of ["govChangeDecision", "govIncidentReviewed", "govComplaintUpdate", "govSaveBroadcast", "govSendBroadcast"]) {
    const start = src.indexOf(`export const ${fn}`);
    const body = src.slice(start, src.indexOf("export const", start + 10) === -1 ? undefined : src.indexOf("export const", start + 10));
    assert.match(body, /assertGovWritable|writable\(/, `${fn} must refuse read-only accounts`);
    assert.match(body, /auditDesk\(/, `${fn} must write the audit log`);
  }
  assert.match(src, /export_csv:/);
  assert.doesNotMatch(src, /child_label/);
});

test("admin keeps its own government views", () => {
  for (const leaf of ["audit", "broadcasts", "complaints", "compliance", "demand", "fee-caps", "funding", "incidents", "ratios", "screening"]) {
    assert.ok(existsSync(new URL(`../src/routes/admin-gov-${leaf}.tsx`, import.meta.url)), leaf);
  }
});

test("CSV exports blank groups under 5 and guard formulas", () => {
  const csv = suppressedCsv(["Area", "Children", "Spaces"], [["R2C", 3, 40], ["R3T", 12, 4], ["=cmd", 9, 9]], [1, 2]);
  const lines = csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  assert.equal(lines[0], "Area,Children,Spaces");
  assert.equal(lines[1].split(",")[1], "");
  assert.equal(lines[1].split(",")[2], "40");
  assert.equal(lines[2].split(",")[2], "");
  assert.match(lines[3], /^'=cmd/);
  assert.equal(shownCount(4, "en"), "Hidden (under 5)");
  assert.equal(shownCount(4, "fr"), "Masqué (moins de 5)");
  assert.equal(shownCount(12, "en"), "12");
});

test("change requests go round trip: review, return, fix, approve", () => {
  const fresh = changeView({ status: "pending", returned_at: null });
  assert.equal(fresh, "to_review");
  const back = changeTransition(fresh, "return", "government");
  assert.deepEqual(back, { ok: true, status: "pending", returned: true });
  const returned = changeView({ status: "pending", returned_at: "2026-11-25T12:00:00Z" });
  assert.equal(returned, "returned");
  assert.equal(changeTransition(returned, "approve", "government").ok, false);
  assert.equal(changeTransition(fresh, "resubmit", "centre").ok, false);
  assert.equal(changeTransition(returned, "approve", "centre").ok, false);
  assert.deepEqual(changeTransition(returned, "resubmit", "centre"), { ok: true, status: "pending", returned: false });
  assert.equal(changeTransition("to_review", "approve", "government").status, "approved");
  assert.equal(changeTransition("approved", "decline", "government").ok, false);
  const provider = read("src/lib/server/wiring/change-requests.ts");
  assert.match(provider, /export const resubmitChangeRequest[\s\S]*listAccessibleDaycareIds/);
});

test("serious occurrences show due, due soon, overdue, and filed", () => {
  const now = new Date("2026-11-25T12:00:00Z");
  assert.equal(incidentClock({ awareAt: "2026-11-24T10:00:00Z", filedAt: null, hours: 24, now }).state, "overdue");
  assert.equal(incidentClock({ awareAt: "2026-11-24T14:00:00Z", filedAt: null, hours: 24, now }).state, "due_soon");
  assert.equal(incidentClock({ awareAt: "2026-11-25T11:00:00Z", filedAt: null, hours: 24, now }).state, "open");
  assert.equal(incidentClock({ awareAt: "2026-11-20T11:00:00Z", filedAt: "2026-11-20T12:00:00Z", hours: 24, now }).state, "filed");
});

test("broadcasts reach only picked centres in the province, and only test centres outside production", () => {
  const centres = [
    { id: "qa1", province: "MB", qa: true },
    { id: "real1", province: "MB", qa: false },
    { id: "on1", province: "ON", qa: true },
  ];
  const test1 = broadcastTargets({ centres, picked: ["qa1", "real1", "on1", "ghost"], province: "MB", production: false });
  assert.deepEqual(test1.allowed.map((c) => c.id), ["qa1"]);
  assert.deepEqual(test1.blocked.sort(), ["ghost", "on1", "real1"]);
  const prod = broadcastTargets({ centres, picked: ["real1"], province: "MB", production: true });
  assert.deepEqual(prod.allowed.map((c) => c.id), ["real1"]);
  assert.equal(broadcastTargets({ centres, picked: [], province: "MB", production: true }).allowed.length, 0);
  assert.equal(broadcastDraftOk({ title: "Hi", body: "Short body here" }), false);
  assert.equal(broadcastDraftOk({ title: "Snow closure", body: "Centres may close early today." }), true);
  const src = read("src/lib/server/gov-desk.ts");
  assert.match(src, /confirm/);
  assert.doesNotMatch(src, /sendSms|twilio/i);
});

test("fee caps flag only a verified fee above a published cap", () => {
  assert.equal(feeOverCap({ dailyCents: 1500, capCents: 1000, verified: true }), true);
  assert.equal(feeOverCap({ dailyCents: 1000, capCents: 1000, verified: true }), false);
  assert.equal(feeOverCap({ dailyCents: 1500, capCents: null, verified: true }), null);
  assert.equal(feeOverCap({ dailyCents: 1500, capCents: 1000, verified: false }), null);
});

test("screening counts expired and due-soon", () => {
  assert.deepEqual(screeningTally([{ status: "expired" }, { status: "expiring" }, { status: "current" }, { status: "x" }]), {
    expired: 1, expiring: 1, current: 1, missing: 1,
  });
});

test("every desk page has English and French text", () => {
  for (const page of GOV_PAGES) {
    assert.ok(page.en && page.fr && page.leadEn && page.leadFr, page.leaf);
    assert.notEqual(page.leadEn, page.leadFr, page.leaf);
  }
  for (const leaf of DESK_LEAVES) assert.ok(GOV_PAGES.some((page) => page.leaf === leaf), leaf);
});

test("migration 0234 is additive with a down file", () => {
  const up = read("migrations/0234_gov_desk_workflows.sql");
  assert.doesNotMatch(up, /\bdrop\b|\btruncate\b|\bdelete\b|alter column .* type/i);
  assert.ok(existsSync(new URL("../migrations/down/0234_gov_desk_workflows.sql", import.meta.url)));
});
