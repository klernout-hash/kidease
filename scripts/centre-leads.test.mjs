import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { QA_TOUR_CENTRE_ID } from "../src/lib/qa-tour-access.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { centreApiEnabled, centreLeadTrackerEnabled } from "../src/lib/features.ts";
import { API_DOC_SECTIONS, LEAD_COPY } from "../src/lib/centre-lead-copy.ts";
import {
  HIDDEN_LEAD_CENTRE_IDS,
  applyLeadUpdate,
  assignLead,
  centreLeadAccess,
  centreLeadFunnel,
  deriveCentreLeadStage,
  factsFromSources,
  filterCentreLeads,
  healthFieldNames,
  isHiddenLeadCentre,
  leadAlertMaySend,
  planCentreLeadAlerts,
  planLeadStageEvent,
  reachedFromSignals,
  resolveLeadCentre,
  toPublicLead,
} from "../src/lib/centre-leads.ts";
import {
  CENTRE_API_LIMIT,
  centreApiDecision,
  handleCentreApi,
  hashCentreApiKey,
  mintCentreApiKey,
  signWebhook,
  webhookHeader,
  webhookNextAttempt,
  webhookUrlAllowed,
} from "../src/lib/centre-api.ts";
import { openWebhookSecret, sealWebhookSecret } from "../src/lib/centre-webhook-crypto.ts";
import { resolveTourCentre } from "../src/lib/tour-phase0.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const now = "2026-11-11T15:00:00.000Z";

function signals(extra = {}) {
  return {
    inquiry: false,
    tours: [],
    bookings: [],
    waitlist: [],
    offers: [],
    agreementStatus: null,
    ...extra,
  };
}

function fact(partial) {
  return {
    parentUserId: "parent-1",
    contactName: "Amina Parent",
    contactEmail: "amina@example.com",
    contactPhone: "2045550100",
    childLabel: "Nora",
    ageGroup: "toddler",
    desiredStart: "2026-09",
    signals: signals({ inquiry: true }),
    startedAt: now,
    activityAt: now,
    tourAt: null,
    offerExpiresAt: null,
    ...partial,
  };
}

test("stage rules follow the open step and explain the rule", () => {
  assert.equal(deriveCentreLeadStage(signals({ inquiry: true }))?.stage, "inquiry");
  assert.equal(deriveCentreLeadStage(signals({ inquiry: true, tours: [{ status: "pending" }] }))?.stage, "inquiry");
  assert.equal(deriveCentreLeadStage(signals({ tours: [{ status: "accepted" }] }))?.ruleId, "tour_accepted");
  assert.equal(deriveCentreLeadStage(signals({ tours: [{ status: "completed" }] }))?.stage, "toured");
  assert.equal(deriveCentreLeadStage(signals({ bookings: [{ status: "requested" }] }))?.stage, "applied");
  assert.equal(deriveCentreLeadStage(signals({ bookings: [{ status: "waitlist" }] }))?.stage, "waitlisted");
  assert.equal(deriveCentreLeadStage(signals({ waitlist: [{ status: "waiting" }] }))?.ruleId, "waitlist_row");
  assert.equal(deriveCentreLeadStage(signals({ offers: [{ status: "open" }] }))?.stage, "offered");
  assert.equal(deriveCentreLeadStage(signals({ bookings: [{ status: "accepted" }] }))?.ruleId, "enrolled_booking");
  assert.equal(deriveCentreLeadStage(signals({ tours: [{ status: "enrolled" }] }))?.ruleId, "enrolled_tour");
  assert.equal(deriveCentreLeadStage(signals({ agreementStatus: "completed" }))?.ruleId, "enrolled_agreement");
  const lost = deriveCentreLeadStage(signals({
    tours: [{ status: "completed" }],
    bookings: [{ status: "declined" }],
  }));
  assert.equal(lost?.stage, "lost");
  assert.equal(lost?.lostReason, "application_declined");
  assert.equal(
    deriveCentreLeadStage(signals({
      tours: [{ status: "accepted" }],
      bookings: [{ status: "declined" }],
    }))?.stage,
    "tour_booked",
  );
  assert.equal(
    deriveCentreLeadStage(signals({
      tours: [{ status: "declined" }],
      bookings: [{ status: "active" }],
    }))?.stage,
    "enrolled",
  );
  assert.equal(deriveCentreLeadStage(signals({ tours: [{ status: "no_show" }] }))?.lostReason, "tour_no_show");
  assert.equal(deriveCentreLeadStage(signals()) , null);
});

test("manual lock holds the step until someone clears it", () => {
  const opened = applyLeadUpdate({
    existing: null,
    fact: fact(),
    now,
    id: "cl1",
    daycareId: "centre-a",
  });
  assert.equal(opened.lead.stage, "inquiry");
  assert.equal(opened.event?.ruleId, "inquiry");
  const locked = applyLeadUpdate({
    existing: opened.lead,
    fact: fact({ signals: signals({ bookings: [{ status: "requested" }] }) }),
    manual: { stage: "tour_booked" },
    now,
    id: "cl1",
    daycareId: "centre-a",
  });
  assert.equal(locked.lead.stage, "tour_booked");
  assert.equal(locked.lead.stageLocked, true);
  assert.equal(locked.lead.autoStage, "applied");
  const held = applyLeadUpdate({
    existing: locked.lead,
    fact: fact({ signals: signals({ bookings: [{ status: "accepted" }] }) }),
    now,
    id: "cl1",
    daycareId: "centre-a",
  });
  assert.equal(held.lead.stage, "tour_booked");
  assert.equal(held.event, null);
  const lost = applyLeadUpdate({
    existing: held.lead,
    fact: null,
    manual: { stage: "lost" },
    now,
    id: "cl1",
    daycareId: "centre-a",
  });
  assert.equal(lost.error, "lost_reason");
  const closed = applyLeadUpdate({
    existing: held.lead,
    fact: null,
    manual: { stage: "lost", lostReason: "chose_other" },
    now,
    id: "cl1",
    daycareId: "centre-a",
  });
  assert.equal(closed.lead.lostReason, "chose_other");
  const unlocked = applyLeadUpdate({
    existing: closed.lead,
    fact: fact({ signals: signals({ bookings: [{ status: "accepted" }] }) }),
    manual: { stage: "lost", unlock: true },
    now,
    id: "cl1",
    daycareId: "centre-a",
  });
  assert.equal(unlocked.lead.stage, "enrolled");
  assert.equal(unlocked.lead.stageLocked, false);
});

test("sources group by the parent and never invent a missing family", () => {
  const facts = factsFromSources({
    conversations: [{ userId: "parent-1", lastAt: now }],
    leads: [],
    tours: [{ userId: "parent-1", at: now, status: "accepted", startAt: "2026-11-12T15:00:00.000Z" }],
    bookings: [{ userId: "parent-2", at: now, status: "waitlist", ageGroup: "infant", startMonth: "2026-10" }],
    waitlist: [],
    offers: [],
    agreements: [{ userId: "parent-1", status: "completed", at: now }],
    people: [{ userId: "parent-1", name: "Amina", email: "amina@example.com" }],
  });
  const amina = facts.find((row) => row.parentUserId === "parent-1");
  assert.equal(deriveCentreLeadStage(amina.signals)?.stage, "enrolled");
  assert.equal(facts.find((row) => row.parentUserId === "parent-2")?.ageGroup, "infant");
  assert.equal(factsFromSources({
    conversations: [],
    leads: [],
    tours: [],
    bookings: [],
    waitlist: [],
    offers: [],
    agreements: [],
    people: [],
  }).length, 0);
});

test("multi-site context never falls back to the first centre", () => {
  const ids = ["centre-a", "centre-b"];
  assert.deepEqual(resolveLeadCentre("", ids), resolveTourCentre({ selectedId: "", memberships: ids }));
  assert.equal(resolveLeadCentre("", ids).ok, false);
  assert.equal(resolveLeadCentre(undefined, ids).reason, "missing");
  assert.equal(resolveLeadCentre("centre-b", ids).centreId, "centre-b");
  assert.equal(resolveLeadCentre("centre-c", ids).reason, "not_a_member");
  assert.equal(resolveLeadCentre("", ["only"]).ok, false);
  assert.notEqual(resolveLeadCentre("", ids).centreId, ids[0]);
});

test("parents, other centres, and staff without permission are rejected", () => {
  const owned = ["centre-a"];
  assert.equal(centreLeadAccess({ centreRole: null, daycareId: "centre-a", accessibleIds: [], action: "read" }).ok, false);
  assert.equal(centreLeadAccess({ centreRole: "owner", daycareId: "centre-b", accessibleIds: owned, action: "read" }).error, "not_found");
  assert.equal(centreLeadAccess({ centreRole: "read_only", daycareId: "centre-a", accessibleIds: owned, action: "read" }).ok, true);
  assert.equal(centreLeadAccess({ centreRole: "read_only", daycareId: "centre-a", accessibleIds: owned, action: "write" }).ok, false);
  assert.equal(centreLeadAccess({ centreRole: "staff", daycareId: "centre-a", accessibleIds: owned, action: "write" }).ok, true);
  assert.equal(centreLeadAccess({ centreRole: "staff", daycareId: "centre-a", accessibleIds: owned, action: "keys" }).ok, false);
  assert.equal(centreLeadAccess({ centreRole: "manager", daycareId: "centre-a", accessibleIds: owned, action: "keys" }).ok, true);
  assert.equal(centreLeadAccess({ centreRole: "owner", daycareId: "centre-a", accessibleIds: owned, action: "keys" }).ok, true);
  const lead = applyLeadUpdate({ existing: null, fact: fact(), now, id: "cl", daycareId: "centre-a" }).lead;
  assert.equal(assignLead(lead, "staff-b", ["staff-a"]).error, "not_on_team");
  assert.equal(assignLead(lead, "staff-a", ["staff-a"]).lead.assignedUserId, "staff-a");
});

test("filters and the funnel use real rows and drop personal details from analytics", () => {
  const leads = [
    { stage: "inquiry", ageGroup: "infant", desiredStart: "2026-09", source: "inquiry", contactName: "Amina", contactEmail: "a@example.com", contactPhone: null, childLabel: "Nora", noteText: "morning" },
    { stage: "enrolled", ageGroup: "toddler", desiredStart: "2026-01", source: "enrolment", contactName: "Bo", contactEmail: null, contactPhone: null, childLabel: null },
  ];
  assert.equal(filterCentreLeads(leads, { query: "nora" }).length, 1);
  assert.equal(filterCentreLeads(leads, { ageGroup: "toddler", desiredStart: "2026-01", source: "enrolment" }).length, 1);
  assert.equal(filterCentreLeads(leads, { stage: "lost" }).length, 0);
  const report = centreLeadFunnel(
    [
      { stage: "inquiry", lostReason: null, reached: reachedFromSignals(signals({ inquiry: true })) },
      { stage: "lost", lostReason: "chose_other", reached: { inquiry: true, tour: true, toured: true, applied: false, enrolled: false } },
    ],
    [
      { leadId: "a", fromStage: null, toStage: "inquiry", at: "2026-11-01T00:00:00.000Z" },
      { leadId: "a", fromStage: "inquiry", toStage: "tour_booked", at: "2026-11-03T00:00:00.000Z" },
    ],
  );
  assert.equal(report.conversion.applicationToEnrolment, null);
  assert.equal(report.conversion.inquiryToTour, 0.5);
  assert.equal(report.medianDays.inquiry, 2);
  assert.equal(report.lostReasons[0].reason, "chose_other");
  const event = planLeadStageEvent({ hiddenCentre: false, from: "inquiry", to: "tour_booked", rule: "tour_accepted", lostReason: null });
  assert.equal(JSON.stringify(event).includes("@"), false);
  assert.equal(JSON.stringify(event).includes("Amina"), false);
  assert.equal(planLeadStageEvent({ hiddenCentre: true, from: null, to: "inquiry", rule: "inquiry", lostReason: null }), null);
  assert.equal(isHiddenLeadCentre(QA_TOUR_CENTRE_ID), true);
  assert.equal(HIDDEN_LEAD_CENTRE_IDS[0], QA_TOUR_CENTRE_ID);
});

test("alerts are idempotent, skip the backlog, hold delivery, and never text", () => {
  const enabledAt = "2026-11-10T00:00:00.000Z";
  const lead = {
    id: "lead-1",
    stage: "inquiry",
    startedAt: "2026-11-01T00:00:00.000Z",
    lastActivityAt: "2026-11-01T00:00:00.000Z",
    tourAt: null,
    offerExpiresAt: null,
  };
  assert.equal(planCentreLeadAlerts({
    now: new Date("2026-11-11T15:00:00.000Z"),
    enabledAt: null,
    staleDays: 3,
    timeZone: "America/Winnipeg",
    emailWanted: true,
    pushWanted: true,
    caslEmail: true,
    live: true,
    leads: [lead],
    already: new Set(),
  }).length, 0);
  const stale = planCentreLeadAlerts({
    now: new Date("2026-11-11T15:00:00.000Z"),
    enabledAt,
    staleDays: 3,
    timeZone: "America/Winnipeg",
    emailWanted: true,
    pushWanted: true,
    caslEmail: true,
    live: true,
    leads: [lead],
    already: new Set(),
  });
  assert.equal(stale.length, 0);
  const fresh = planCentreLeadAlerts({
    now: new Date("2026-11-11T15:00:00.000Z"),
    enabledAt,
    staleDays: 3,
    timeZone: "America/Winnipeg",
    emailWanted: true,
    pushWanted: true,
    caslEmail: false,
    live: false,
    leads: [{ ...lead, startedAt: "2026-11-11T12:00:00.000Z", lastActivityAt: "2026-11-11T12:00:00.000Z" }],
    already: new Set(),
  });
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].kind, "new_lead");
  assert.equal(fresh[0].email, "skip");
  assert.equal(fresh[0].sms, "skip");
  assert.equal(leadAlertMaySend(fresh[0]), false);
  const again = planCentreLeadAlerts({
    now: new Date("2026-11-11T16:00:00.000Z"),
    enabledAt,
    staleDays: 3,
    timeZone: "America/Winnipeg",
    emailWanted: true,
    pushWanted: true,
    caslEmail: true,
    live: true,
    quiet: true,
    leads: [{ ...lead, startedAt: "2026-11-11T12:00:00.000Z", lastActivityAt: "2026-11-11T12:00:00.000Z" }],
    already: new Set([fresh[0].key]),
  });
  assert.equal(again.length, 0);
  const tomorrow = planCentreLeadAlerts({
    now: new Date("2026-11-11T18:00:00.000Z"),
    enabledAt,
    staleDays: 3,
    timeZone: "America/Winnipeg",
    emailWanted: true,
    pushWanted: true,
    caslEmail: true,
    live: true,
    leads: [{
      ...lead,
      stage: "tour_booked",
      startedAt: "2026-11-11T12:00:00.000Z",
      lastActivityAt: "2026-11-11T12:00:00.000Z",
      tourAt: "2026-11-12T15:00:00.000Z",
    }],
    already: new Set(),
  });
  assert.equal(tomorrow.some((row) => row.kind === "tour_tomorrow"), true);
  assert.equal(tomorrow.every((row) => row.sms === "skip" && leadAlertMaySend(row) === false), true);
});

test("api keys, scopes, health fields, and webhooks stay inside one centre", async () => {
  const minted = mintCentreApiKey();
  assert.equal(minted.token.startsWith("ke_"), true);
  assert.equal(minted.hash, hashCentreApiKey(minted.token));
  assert.equal(minted.hash.includes(minted.token), false);
  const key = { id: "key-1", daycareId: "centre-a", scopes: ["read"], revoked: false, hash: minted.hash };
  assert.equal(centreApiDecision({ key, presentedHash: minted.hash, method: "GET", hitsInWindow: 0 }).ok, true);
  assert.equal(centreApiDecision({ key, presentedHash: "nope", method: "GET", hitsInWindow: 0 }).status, 401);
  assert.equal(centreApiDecision({ key: { ...key, revoked: true }, presentedHash: minted.hash, method: "GET", hitsInWindow: 0 }).status, 401);
  assert.equal(centreApiDecision({ key, presentedHash: minted.hash, method: "PATCH", hitsInWindow: 0 }).status, 403);
  assert.equal(centreApiDecision({
    key: { ...key, scopes: ["write"] },
    presentedHash: minted.hash,
    requestedDaycareId: "centre-b",
    method: "GET",
    hitsInWindow: 0,
  }).status, 403);
  assert.equal(centreApiDecision({ key, presentedHash: minted.hash, method: "GET", hitsInWindow: CENTRE_API_LIMIT }).status, 429);
  assert.equal(webhookUrlAllowed("http://example.com/hook"), false);
  assert.equal(webhookUrlAllowed("https://127.0.0.1/hook"), false);
  assert.equal(webhookUrlAllowed("https://hooks.example.com/kidease"), true);
  const body = JSON.stringify({ event: "lead.stage_changed" });
  const header = webhookHeader("secret", "100", body);
  assert.equal(header, `t=100,v1=${signWebhook("secret", "100", body)}`);
  assert.equal(webhookNextAttempt(0, new Date(0))?.toISOString(), "1970-01-01T00:00:00.000Z");
  assert.equal(webhookNextAttempt(4, new Date()), null);
  const health = healthFieldNames({ contactName: "Amina", allergies: "nuts", birthdate: "2022-01-01" });
  assert.deepEqual(health.sort(), ["allergies", "birthdate"]);
  const pub = toPublicLead({
    id: "cl",
    stage: "inquiry",
    source: "website",
    contactName: "Amina",
    allergies: "nuts",
    medical_notes: "secret",
    birthdate: "2022-01-01",
    ageGroup: "toddler",
  });
  assert.equal(JSON.stringify(pub).includes("nuts"), false);
  assert.equal(JSON.stringify(pub).includes("birth"), false);
  assert.equal(pub.ageGroup, "toddler");

  const store = memoryStore(key);
  const denied = await handleCentreApi({
    request: new Request("https://kidease.ca/api/v1/centre/leads", { headers: { authorization: "Bearer ke_wrong_token_value" } }),
    store,
    enabled: true,
    now: new Date(now),
  });
  assert.equal(denied.status, 401);
  const off = await handleCentreApi({
    request: new Request("https://kidease.ca/api/v1/centre/leads", { headers: { authorization: `Bearer ${minted.token}` } }),
    store,
    enabled: false,
    now: new Date(now),
  });
  assert.equal(off.status, 404);
  const listed = await handleCentreApi({
    request: new Request("https://kidease.ca/api/v1/centre/leads", {
      headers: { authorization: `Bearer ${minted.token}`, "x-kidease-centre": "centre-b" },
    }),
    store,
    enabled: true,
    now: new Date(now),
  });
  assert.equal(listed.status, 403);
  const read = await handleCentreApi({
    request: new Request("https://kidease.ca/api/v1/centre/leads/cl", { headers: { authorization: `Bearer ${minted.token}` } }),
    store,
    enabled: true,
    now: new Date(now),
  });
  assert.equal(read.status, 200);
  const bodyJson = await read.json();
  assert.match(bodyJson.privacy, /PIPEDA/);
  assert.equal(JSON.stringify(bodyJson).includes("nuts"), false);
  const patch = await handleCentreApi({
    request: new Request("https://kidease.ca/api/v1/centre/leads/cl", {
      method: "PATCH",
      headers: { authorization: `Bearer ${minted.token}` },
      body: JSON.stringify({ stage: "lost", lostReason: "other" }),
    }),
    store,
    enabled: true,
    now: new Date(now),
  });
  assert.equal(patch.status, 403);
  const healthPost = await handleCentreApi({
    request: new Request("https://kidease.ca/api/v1/centre/leads", {
      method: "POST",
      headers: { authorization: `Bearer ${store.writeToken}` },
      body: JSON.stringify({ contactName: "Bo", allergies: "nuts" }),
    }),
    store,
    enabled: true,
    now: new Date(now),
  });
  assert.equal(healthPost.status, 400);
});

test("webhook signing secrets are encrypted at rest and opened only to sign", () => {
  const env = { CENTRE_WEBHOOK_KEY: "ab".repeat(32) };
  const plain = "ke_webhook_signing_secret";
  assert.equal(sealWebhookSecret(plain, {}), null);
  assert.equal(openWebhookSecret(plain, env), "");
  const sealed = sealWebhookSecret(plain, env);
  assert.ok(sealed);
  assert.equal(sealed.startsWith("kew1:"), true);
  assert.equal(sealed.includes(plain), false);
  assert.equal(openWebhookSecret(sealed, env), plain);
  assert.equal(openWebhookSecret(sealed, { CENTRE_WEBHOOK_KEY: "cd".repeat(32) }), "");
  const body = JSON.stringify({ event: "lead.stage_changed" });
  assert.equal(webhookHeader(openWebhookSecret(sealed, env), "100", body), webhookHeader(plain, "100", body));
  const server = readFileSync(join(root, "src/lib/server/centre-leads.ts"), "utf8");
  assert.match(server, /sealWebhookSecret/);
  assert.match(server, /openWebhookSecret\(hook\.secret\)/);
  assert.doesNotMatch(server, /webhookHeader\(hook\.secret/);
});

test("flags stay off and the docs name privacy in English and French", () => {
  assert.equal(FLAG_DEFAULTS.FEATURE_CENTRE_LEAD_TRACKER, false);
  assert.equal(FLAG_DEFAULTS.FEATURE_CENTRE_API, false);
  assert.equal(centreLeadTrackerEnabled({}), false);
  assert.equal(centreApiEnabled({ FEATURE_CENTRE_API: "1" }), false);
  assert.equal(centreApiEnabled({ FEATURE_CENTRE_LEAD_TRACKER: "1", FEATURE_CENTRE_API: "1" }), true);
  assert.match(LEAD_COPY.en.consent, /PIPEDA/);
  assert.match(LEAD_COPY.fr.consent, /Loi 25/);
  assert.match(API_DOC_SECTIONS.en.map((row) => row.body).join(" "), /Law 25/);
  assert.match(API_DOC_SECTIONS.fr.map((row) => row.body).join(" "), /Loi 25/);
  assert.equal(LEAD_COPY.en.apiOff.includes("off"), true);
  const server = readFileSync(join(root, "src/lib/server/centre-leads.ts"), "utf8");
  assert.doesNotMatch(server, /ghl|highlevel|allerg|medical_notes|birthdate/i);
  assert.doesNotMatch(readFileSync(join(root, "src/lib/centre-leads.ts"), "utf8"), /ghl|stripe/i);
  assert.match(readFileSync(join(root, "src/routes/api/centre-lead-alerts.ts"), "utf8"), /centreLeadTrackerEnabled/);
});

test("the lead tables do not store child health", async () => {
  const pg = new PGlite();
  await pg.exec("create table daycares (id text primary key, timezone text);");
  const sql = readFileSync(new URL("../migrations/0200_centre_lead_tracker.sql", import.meta.url), "utf8");
  await pg.exec(sql);
  await pg.exec("insert into daycares (id) values ('centre-a');");
  const columns = await pg.query(
    "select column_name from information_schema.columns where table_name = 'centre_leads'",
  );
  const names = columns.rows.map((row) => row.column_name).join(" ");
  assert.doesNotMatch(names, /allerg|medic|birth|health|immun/);
  await pg.query(
    "insert into centre_leads (id, daycare_id, parent_user_id, stage) values ('a', 'centre-a', 'parent-1', 'inquiry')",
  );
  await assert.rejects(
    pg.query("insert into centre_leads (id, daycare_id, parent_user_id, stage) values ('b', 'centre-a', 'parent-1', 'inquiry')"),
  );
  await pg.query(
    "insert into centre_api_keys (id, daycare_id, name, prefix, key_hash, scopes) values ('k', 'centre-a', 'Desk', 'ke_abc', 'hash', 'read')",
  );
  await pg.query("update centre_api_keys set revoked_at = now() where id = 'k'");
  const revoked = await pg.query("select revoked_at from centre_api_keys where id = 'k'");
  assert.ok(revoked.rows[0].revoked_at);
});

function memoryStore(readKey) {
  const write = mintCentreApiKey();
  const leads = new Map([
    ["cl", {
      id: "cl",
      stage: "inquiry",
      stageLocked: false,
      lostReason: null,
      source: "inquiry",
      contactName: "Amina",
      allergies: "nuts",
      ageGroup: "toddler",
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
    }],
  ]);
  const keys = new Map([
    [readKey.hash, readKey],
    [write.hash, { id: "key-2", daycareId: "centre-a", scopes: ["write"], revoked: false, hash: write.hash }],
  ]);
  return {
    writeToken: write.token,
    async findKey(hash) {
      return keys.get(hash) ?? null;
    },
    async countHits() {
      return 0;
    },
    async addHit() {},
    async touchKey() {},
    async audit() {},
    async listLeads() {
      return [...leads.values()];
    },
    async getLead(_daycareId, id) {
      return leads.get(id) ?? null;
    },
    async updateStage() {
      return null;
    },
    async addNote() {
      return null;
    },
    async createLead() {
      return null;
    },
  };
}
