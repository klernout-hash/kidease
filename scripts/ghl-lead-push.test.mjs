import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  TWILIO_LINE_TYPE_USD_PER_LOOKUP,
  audienceForLead,
  classifyLineType,
  ghlLeadPushEnabled,
  ghlLineTypeEnabled,
  isQaGhlLead,
  leadTags,
  lineTypeTag,
  nextPushDelayMs,
  pipelineName,
  reconcileGhlSignups,
  runLeadPush,
} from "../src/lib/ghl-lead-push.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("parent and daycare signups use the matching pipeline", () => {
  assert.equal(pipelineName(audienceForLead({ role: "parent", trigger: "parent_signup" })), "Parent Onboard");
  assert.equal(pipelineName(audienceForLead({ role: "provider", trigger: "provider_signup" })), "Daycare Sign Up");
  assert.equal(pipelineName(audienceForLead({ role: "provider", trigger: "claim_verify" })), "Daycare Sign Up");
});

test("a claim or provider signup is not a centre CRM write", () => {
  const server = readFileSync(join(root, "src/lib/server/ghl-lead-push.ts"), "utf8");
  const pure = readFileSync(join(root, "src/lib/ghl-lead-push.ts"), "utf8");
  for (const src of [server, pure]) {
    assert.equal(src.includes("createOrUpdateLead"), false);
    assert.equal(src.includes("rememberCentreLead"), false);
    assert.equal(src.includes("centre_leads"), false);
    assert.equal(src.includes("/workflows"), false);
    assert.doesNotMatch(src, /messages\.create|Messages\.json|\/email\/send/);
  }
});

test("qa and reviewer accounts get the qa:test tag", () => {
  for (const email of [
    "reviewer.parent@kidease.ca",
    "reviewer-parent@kidease.ca",
    "qa-parent-two@kidease.ca",
    "qa-staff-readonly@kidease.ca",
    "kyle+qa-family@kidease.ca",
  ]) {
    assert.equal(isQaGhlLead({ email }), true, email);
    assert.equal(leadTags({ userId: "u", role: "parent", trigger: "parent_signup", email }, null).includes("qa:test"), true);
  }
  assert.equal(isQaGhlLead({ name: "John Doe", email: "real@example.com" }), true);
  assert.equal(isQaGhlLead({ email: "parent@example.com", isTest: true }), true);
  assert.equal(isQaGhlLead({ email: "parent@example.com" }), false);
});

test("line type lookup stays off and maps mobile or no-sms", () => {
  assert.equal(ghlLineTypeEnabled({}), false);
  assert.equal(ghlLeadPushEnabled({}), false);
  assert.equal(ghlLineTypeEnabled({ FEATURE_GHL_LINE_TYPE: "1" }), true);
  assert.equal(TWILIO_LINE_TYPE_USD_PER_LOOKUP, 0.008);
  assert.equal(classifyLineType({ valid: true, type: "mobile" }), "mobile");
  assert.equal(classifyLineType({ valid: true, type: "landline" }), "landline");
  assert.equal(classifyLineType({ valid: false, type: "mobile" }), "invalid");
  assert.equal(classifyLineType({ valid: true, type: "fixedVoip" }), "invalid");
  assert.equal(lineTypeTag("mobile"), "sms:mobile");
  assert.equal(lineTypeTag("landline"), "sms:no-sms");
  assert.equal(lineTypeTag("invalid"), "sms:no-sms");
  assert.equal(lineTypeTag(null), null);
});

test("the push is idempotent per user and retries with backoff", async () => {
  assert.equal(nextPushDelayMs(1), 5 * 60_000);
  assert.equal(nextPushDelayMs(5), null);
  const rows = new Map();
  let lookups = 0;
  let pushes = 0;
  const deps = {
    env: { FEATURE_GHL_LEAD_PUSH: "1", FEATURE_GHL_LINE_TYPE: "0" },
    now: "2026-11-11T12:00:00.000Z",
    force: true,
    loadRow: async (userId) => rows.get(userId) || null,
    saveRow: async (row) => {
      rows.set(row.userId, row);
    },
    lookupLine: async () => {
      lookups += 1;
      return { valid: true, type: "mobile" };
    },
    pushContact: async () => {
      pushes += 1;
      return { ok: true, skipped: false, contactId: "contact_1", opportunityId: "opp_1" };
    },
  };
  const input = { userId: "user-1", role: "parent", trigger: "parent_signup", email: "parent@example.com", phone: "+12045550100" };
  const first = await runLeadPush(input, deps);
  assert.equal(first.tookOver, true);
  assert.equal(first.result, "ok");
  assert.equal(rows.size, 1);
  assert.equal(lookups, 0);
  const again = await runLeadPush(input, { ...deps, force: false });
  assert.equal(again.result, "ok");
  assert.equal(pushes, 1);

  rows.set("user-2", { userId: "user-2", attempts: 1, result: "retry", contactId: null, opportunityId: null, nextAttemptAt: "2026-11-11T18:00:00.000Z", lineType: null });
  const waited = await runLeadPush(
    { ...input, userId: "user-2" },
    { ...deps, force: false },
  );
  assert.equal(waited.result, "retry");
  assert.equal(pushes, 1);
});

test("a failed push stores the next attempt and does not email", async () => {
  const rows = new Map();
  const saved = await runLeadPush(
    { userId: "user-3", role: "provider", trigger: "claim_verify", email: "owner@day.ca" },
    {
      env: { FEATURE_GHL_LEAD_PUSH: "1" },
      now: "2026-11-11T12:00:00.000Z",
      force: true,
      loadRow: async () => null,
      saveRow: async (row) => {
        rows.set(row.userId, row);
      },
      pushContact: async () => ({ ok: false, error: "GHL API 500" }),
    },
  );
  assert.equal(saved.result, "retry");
  assert.equal(rows.get("user-3").attempts, 1);
  assert.equal(rows.get("user-3").nextAttemptAt, "2026-11-11T12:05:00.000Z");
  assert.equal(rows.get("user-3").audience, "daycare");
});

test("the daily check flags missing contacts, opportunities, and late welcomes", () => {
  const signups = [
    { userId: "a", email: "a@example.com", signedUpAt: "2026-11-11T08:00:00.000Z" },
    { userId: "b", email: "b@example.com", signedUpAt: "2026-11-11T08:00:00.000Z" },
    { userId: "c", email: "c@example.com", signedUpAt: "2026-11-11T08:00:00.000Z" },
    { userId: "d", email: "d@example.com", signedUpAt: "2026-11-11T11:30:00.000Z" },
  ];
  const snapshots = new Map([
    ["a@example.com", { email: "a@example.com", contactId: null, opportunityId: null, welcomeEmailAt: null }],
    ["b@example.com", { email: "b@example.com", contactId: "c1", opportunityId: null, welcomeEmailAt: "2026-11-11T08:20:00.000Z" }],
    ["c@example.com", { email: "c@example.com", contactId: "c2", opportunityId: "o2", welcomeEmailAt: "2026-11-11T10:30:00.000Z" }],
    ["d@example.com", { email: "d@example.com", contactId: "c3", opportunityId: "o3", welcomeEmailAt: null }],
  ]);
  const report = reconcileGhlSignups(signups, snapshots, "2026-11-11T12:00:00.000Z");
  assert.deepEqual(
    report.gaps.map((gap) => `${gap.userId}:${gap.kind}`),
    ["a:missing_contact", "b:missing_opportunity", "c:missing_welcome"],
  );
});

test("the push flag off does not call GoHighLevel or Twilio", async () => {
  let called = 0;
  const result = await runLeadPush(
    { userId: "user-1", role: "parent", trigger: "parent_signup", email: "parent@example.com" },
    {
      env: {},
      now: "2026-11-11T12:00:00.000Z",
      loadRow: async () => null,
      saveRow: async () => {
        called += 1;
      },
      lookupLine: async () => {
        called += 1;
        return null;
      },
      pushContact: async () => {
        called += 1;
        return { ok: false, error: "no" };
      },
    },
  );
  assert.deepEqual(result, { tookOver: false, reason: "flag-off" });
  assert.equal(called, 0);
});
