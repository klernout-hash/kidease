// GoHighLevel lead fix (2026-11-25): sign-up email lookup, skip fallback,
// stamp after success, the daily reconcile, and every form's contact upsert.
// Fake ids and a mocked fetch only. No network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { findSignupMisses, resolveLeadContact, runLeadPush } from "../src/lib/ghl-lead-push.ts";
import { ghlIntakeConfirmed } from "../src/lib/ghl-intake.ts";
import {
  GHL_FORM_KEYS,
  ghlFormTags,
  postGhlFormLead,
  publicMessageForm,
  resolveGhlSiteSupportTarget,
} from "../src/lib/ghl-form-lead.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");
const NOW = "2026-11-25T12:00:00.000Z";

function pushDeps(overrides = {}) {
  const rows = new Map();
  const pushed = [];
  const skips = [];
  return {
    rows,
    pushed,
    skips,
    deps: {
      env: { FEATURE_GHL_LEAD_PUSH: "1" },
      now: NOW,
      force: true,
      loadRow: async (userId) => rows.get(userId) || null,
      saveRow: async (row) => {
        rows.set(row.userId, row);
      },
      onSkip: (reason) => skips.push(reason),
      pushContact: async (payload) => {
        pushed.push(payload);
        return { ok: true, skipped: false, contactId: "contact_fake_1", opportunityId: "opp_fake_1" };
      },
      ...overrides,
    },
  };
}

// ---- 1. Email lookup ------------------------------------------------------

test("setRole-style push with only a user id reads email, name, and phone from the account", async () => {
  const lookups = [];
  const { rows, pushed, deps } = pushDeps({
    lookupContact: async (userId) => {
      lookups.push(userId);
      return { email: "Parent.Fake@example.com", name: "Pat Fake", phone: "+12045550100" };
    },
  });
  const result = await runLeadPush({ userId: "user_fake_1", role: "parent", trigger: "parent_signup" }, deps);
  assert.equal(result.tookOver, true);
  assert.equal(result.result, "ok");
  assert.deepEqual(lookups, ["user_fake_1"]);
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].email, "parent.fake@example.com");
  assert.equal(pushed[0].name, "Pat Fake");
  assert.equal(pushed[0].phone, "+12045550100");
  assert.equal(rows.get("user_fake_1").result, "ok");
  assert.equal(rows.get("user_fake_1").contactId, "contact_fake_1");
});

test("a passed email wins and the account lookup only fills the gaps", async () => {
  const filled = await resolveLeadContact(
    { userId: "u", role: "provider", trigger: "provider_signup", email: "owner@day.example", name: "" },
    async () => ({ email: "other@example.com", name: "Owner Fake", phone: null }),
  );
  assert.equal(filled.email, "owner@day.example");
  assert.equal(filled.name, "Owner Fake");
  assert.equal(filled.phone, null);
});

test("the server push wires the account lookup and logs skips without the email", () => {
  const server = src("src/lib/server/ghl-lead-push.ts");
  assert.match(server, /lookupContact: lookupLeadContact/);
  assert.match(server, /onSkip: \(reason\) => logPushSkip\(input, reason\)/);
  const logFn = server.slice(server.indexOf("function logPushSkip"), server.indexOf("export async function pushLeadToGhl"));
  assert.doesNotMatch(logFn, /email/);
  // pushContact uses the looked-up email, not the caller's empty one.
  assert.match(server, /pushContact: async \(\{ extraTags, allowReviewer, email, name, phone \}\)/);
});

// ---- 2. Skip fallback -----------------------------------------------------

test("no email even after lookup: not taken over, skip logged, nothing saved", async () => {
  const { rows, pushed, skips, deps } = pushDeps({ lookupContact: async () => ({ email: null }) });
  const result = await runLeadPush({ userId: "user_fake_2", role: "parent", trigger: "parent_signup" }, deps);
  assert.deepEqual(result, { tookOver: false, reason: "no-email" });
  assert.deepEqual(skips, ["no-email"]);
  assert.equal(pushed.length, 0);
  assert.equal(rows.size, 0);
});

test("a skipped GoHighLevel call is recorded and hands back to the older path", async () => {
  const { rows, skips, deps } = pushDeps({
    pushContact: async () => ({ ok: true, skipped: true, reason: "no-api-token" }),
  });
  const result = await runLeadPush(
    { userId: "user_fake_3", role: "provider", trigger: "provider_signup", email: "owner@day.example" },
    deps,
  );
  assert.deepEqual(result, { tookOver: false, reason: "skipped", detail: "no-api-token" });
  assert.deepEqual(skips, ["no-api-token"]);
  assert.equal(rows.get("user_fake_3").result, "skipped");
  assert.equal(rows.get("user_fake_3").lastError, "skipped: no-api-token");
});

test("a failed push is recorded in ghl_lead_pushes for retry", async () => {
  const { rows, deps } = pushDeps({ pushContact: async () => ({ ok: false, error: "GHL API 500" }) });
  const result = await runLeadPush(
    { userId: "user_fake_4", role: "parent", trigger: "parent_signup", email: "p@example.com" },
    deps,
  );
  assert.equal(result.tookOver, true);
  assert.equal(result.result, "retry");
  assert.equal(rows.get("user_fake_4").result, "retry");
  assert.equal(rows.get("user_fake_4").lastError, "GHL API 500");
  assert.equal(rows.get("user_fake_4").nextAttemptAt, "2026-11-25T12:05:00.000Z");
});

test("captureSignupIntakeFromUser falls through to the older path when the push does not take over", () => {
  const intake = src("src/lib/server/ghl-intake.ts");
  const capture = intake.slice(intake.indexOf("export async function captureSignupIntakeFromUser"));
  const tookOver = capture.indexOf("if (pushed.tookOver)");
  const skipLog = capture.indexOf("lead push skipped reason=");
  const fallback = capture.indexOf("lookupUser(input.userId)");
  assert.ok(tookOver > 0 && skipLog > tookOver && fallback > skipLog, "skip is logged, then the fallback runs");
  assert.doesNotMatch(capture.slice(0, fallback), /pushed\.result === "skipped"/);
});

// ---- 3. Stamp after success -----------------------------------------------

test("crm_*_at is stamped only when GoHighLevel confirmed the contact", () => {
  assert.equal(ghlIntakeConfirmed({ ok: true, skipped: false, status: 200 }), true);
  assert.equal(ghlIntakeConfirmed({ ok: true, skipped: true, reason: "flag-off" }), false);
  assert.equal(ghlIntakeConfirmed({ ok: false, error: "ghl-lead-push" }), false);
  assert.equal(ghlIntakeConfirmed(null), false);

  const family = src("src/lib/server/family.ts");
  const ensure = family.slice(family.indexOf("export async function ensureCrmIntake"), family.indexOf("export const getFamily"));
  // No stamping before the push: the eligibility read is a select.
  assert.doesNotMatch(ensure, /set crm_signup_at = now\(\)/);
  assert.doesNotMatch(ensure, /set crm_provider_at = now\(\)/);
  const ping = ensure.indexOf("pingNewAccount(");
  const confirmed = ensure.indexOf("if (confirmed)");
  const stamp = ensure.indexOf("stampCrmFiled(");
  assert.ok(ping > 0 && confirmed > ping && stamp > confirmed, "stamp sits after the push, inside if (confirmed)");

  const server = src("src/lib/server/ghl-lead-push.ts");
  const stampFn = server.slice(server.indexOf("export async function stampCrmFiled"));
  assert.match(stampFn, /crm_provider_at = now\(\) where user_id = \$\{userId\} and crm_provider_at is null/);
  assert.match(stampFn, /crm_signup_at = now\(\) where user_id = \$\{userId\} and crm_signup_at is null/);
});

test("admin notice and user mail stay once-only and never wait on GoHighLevel", () => {
  const family = src("src/lib/server/family.ts");
  const ping = family.slice(family.indexOf("async function pingNewAccount"), family.indexOf("export async function ensureCrmIntake"));
  assert.match(ping, /claimActorMailOnce/);
  assert.match(ping, /crm_notice_parent/);
  assert.match(ping, /crm_notice_provider/);
  assert.match(ping, /force: false/);
});

// ---- Parent filing rules ----------------------------------------------------

test("default-role parents are filed on sign-up or a parent action, without a 30-minute window", () => {
  const family = src("src/lib/server/family.ts");
  const ensure = family.slice(family.indexOf("export async function ensureCrmIntake"), family.indexOf("export const getFamily"));
  assert.doesNotMatch(ensure, /30 minutes/);
  assert.match(ensure, /extra\?\.parentAction !== true/);
  const forms = src("src/lib/server/ghl-form-lead.ts");
  assert.match(forms, /ensureCrmIntake\(userId, "parent", \{ parentAction: true \}\)/);
});

// ---- 5. Reconcile -----------------------------------------------------------

test("the daily check finds sign-ups with no ok push row", () => {
  const misses = findSignupMisses(
    [
      { userId: "a", role: "parent" },
      { userId: "b", role: "provider" },
      { userId: "c", role: "parent" },
      { userId: "d", role: "parent" },
      { userId: "e", role: "provider" },
    ],
    [
      { userId: "b", result: "retry", contactId: null, opportunityId: null },
      { userId: "c", result: "ok", contactId: "c1", opportunityId: null },
      { userId: "d", result: "ok", contactId: "c2", opportunityId: "o2" },
      { userId: "e", result: "skipped", contactId: null, opportunityId: null },
    ],
  );
  assert.deepEqual(
    misses.map((miss) => `${miss.userId}:${miss.kind}`),
    ["a:missing_contact", "b:missing_contact", "c:missing_opportunity", "e:missing_contact"],
  );
});

test("each reconcile run writes its row first and finishes it in finally", () => {
  const server = src("src/lib/server/ghl-lead-push.ts");
  const run = server.slice(server.indexOf("export async function runGhlLeadReconcile"), server.indexOf("export async function stampCrmFiled"));
  const insert = run.indexOf("insert into ghl_lead_reconcile");
  const flagCheck = run.indexOf("if (!enabled)");
  const finallyAt = run.indexOf("} finally {");
  assert.ok(insert > 0 && flagCheck > insert, "row is written even when the flag is off");
  assert.ok(finallyAt > flagCheck && run.indexOf("update ghl_lead_reconcile", finallyAt) > finallyAt);
  assert.match(run, /from ghl_lead_pushes where user_id = any/);
  assert.match(run, /findSignupMisses/);
  assert.match(run, /pushLeadToGhl\(/);
  assert.match(run, /inBudget\(\)/);
  const route = src("src/routes/api/ghl-lead-reconcile.ts");
  assert.match(route, /cronAuthorized\(request\)/);
  assert.match(route, /catch \(err\)/);
  const vercel = JSON.parse(src("vercel.json"));
  assert.ok(vercel.crons.some((cron) => cron.path === "/api/ghl-lead-reconcile"));
});

// ---- 4. Forms -------------------------------------------------------------

const ENV = {
  FEATURE_GHL_LEAD_PUSH: "1",
  GHL_API_TOKEN: "pit-fake-token",
  GHL_SITE_PIPELINE_ID: "pipe_fake_site",
  GHL_SITE_SUPPORT_STAGE_ID: "stage_fake_support",
};

function mockGhl() {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const path = String(url);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: path, method: init.method, body });
    const json = (value, status = 200) =>
      new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
    if (path.endsWith("/contacts/upsert")) return json({ contact: { id: "contact_fake_9" } });
    if (path.includes("/tags")) return json({ tags: body?.tags || [] });
    if (path.includes("/opportunities/search")) return json({ opportunities: [] });
    if (path.endsWith("/opportunities/")) return json({ opportunity: { id: "opp_fake_9" } }, 201);
    return json({}, 404);
  };
  return { calls, fetchImpl };
}

async function sendForm(form, extra = {}) {
  const { calls, fetchImpl } = mockGhl();
  const result = await postGhlFormLead({
    form,
    email: "visitor.fake@example.com",
    name: "Vee Fake",
    phone: "+12045550199",
    env: ENV,
    fetchImpl,
    ...extra,
  });
  return { calls, result };
}

function assertUpsertAndTag(calls, result, form) {
  const upsert = calls.find((call) => call.method === "POST" && call.url.endsWith("/contacts/upsert"));
  assert.ok(upsert, `${form}: upsert call`);
  assert.equal(upsert.body.email, "visitor.fake@example.com");
  assert.equal(upsert.body.locationId, "hkAJnVH8EJpMcgq9bNjG");
  assert.equal(upsert.body.tags, undefined, "upsert must not replace tags");
  const tag = calls.find((call) => call.method === "POST" && call.url.endsWith("/contacts/contact_fake_9/tags"));
  assert.ok(tag, `${form}: tag call`);
  assert.deepEqual(tag.body.tags, ["source:website", `form:${form}`]);
  assert.equal(result.ok, true);
  assert.equal(result.skipped, false);
  assert.equal(result.contactId, "contact_fake_9");
}

function serverFn(rel, marker, endMarker) {
  const file = src(rel);
  const start = file.indexOf(marker);
  assert.ok(start >= 0, `${marker} in ${rel}`);
  const end = endMarker ? file.indexOf(endMarker, start + marker.length) : -1;
  return file.slice(start, end > start ? end : undefined);
}

test("form keys cover every routed form", () => {
  assert.deepEqual([...GHL_FORM_KEYS].sort(), ["claim-start", "contact", "help", "info", "job-apply", "report", "spot", "tour", "waitlist"]);
  assert.deepEqual(ghlFormTags("tour", { email: "qa-parent-two@kidease.ca" }), ["source:website", "form:tour", "qa:test"]);
});

test("contact page: upsert + form:contact + KidEase Site support card", async () => {
  const { calls, result } = await sendForm("contact", { subject: "Contact: Question" });
  assertUpsertAndTag(calls, result, "contact");
  const opp = calls.find((call) => call.method === "POST" && call.url.endsWith("/opportunities/"));
  assert.equal(opp.body.pipelineId, "pipe_fake_site");
  assert.equal(opp.body.pipelineStageId, "stage_fake_support");
  assert.equal(opp.body.contactId, "contact_fake_9");
  assert.equal(result.opportunity, "created");
  assert.equal(publicMessageForm({ kind: "contact" }), "contact");
  assert.match(src("src/routes/contact.tsx"), /kind: "contact" as const/);
});

test("help page: upsert + form:help + support card", async () => {
  const { calls, result } = await sendForm("help");
  assertUpsertAndTag(calls, result, "help");
  assert.equal(result.opportunity, "created");
  assert.equal(publicMessageForm({ kind: "support", form: "help" }), "help");
  assert.equal(publicMessageForm({ kind: "support" }), "help");
  assert.match(src("src/routes/help.tsx"), /kind: "support", form: "help"/);
});

test("report a listing: upsert + form:report + support card", async () => {
  const { calls, result } = await sendForm("report");
  assertUpsertAndTag(calls, result, "report");
  assert.equal(result.opportunity, "created");
  assert.equal(publicMessageForm({ kind: "support", form: "report" }), "report");
  assert.match(src("src/routes/report.tsx"), /form: "report"/);
});

test("listing contact box: upsert + form:contact", async () => {
  const { calls, result } = await sendForm(publicMessageForm({ kind: "contact" }));
  assertUpsertAndTag(calls, result, "contact");
  assert.match(src("src/components/listing-contact.tsx"), /kind: "contact"/);
});

test("jobs interest: upsert + form:contact", async () => {
  const { calls, result } = await sendForm(publicMessageForm({ kind: "contact", form: null }));
  assertUpsertAndTag(calls, result, "contact");
  assert.match(src("src/components/jobs-interest-form.tsx"), /intent: "job-interest"/);
});

test("submitPublicMessage routes to GoHighLevel and keeps the admin email", () => {
  const fn = serverFn("src/lib/server/notify.ts", "export const submitPublicMessage", "export const listPlatformEvents");
  const notify = fn.indexOf("notifyPlatform(");
  const ghl = fn.indexOf("captureFormLead(");
  assert.ok(notify > 0 && ghl > notify, "admin notice still goes out first");
  assert.match(fn, /publicMessageForm\(\{ kind: data\.kind, form: data\.form \}\)/);
  assert.equal(publicMessageForm({ kind: "enroll" }), null);
});

test("support card is skipped with a reason when the KidEase Site ids are not set", async () => {
  const skips = [];
  const { calls, fetchImpl } = mockGhl();
  const result = await postGhlFormLead({
    form: "help",
    email: "visitor.fake@example.com",
    env: { FEATURE_GHL_LEAD_PUSH: "1", GHL_API_TOKEN: "pit-fake-token" },
    fetchImpl,
    onSkip: (reason) => skips.push(reason),
  });
  assert.equal(result.opportunity, "skipped-no-pipeline");
  assert.equal(calls.some((call) => call.url.includes("/opportunities")), false);
  assert.match(skips.join(" "), /site pipeline or support stage id not set/);
  assert.equal(resolveGhlSiteSupportTarget({ GHL_SITE_PIPELINE_ID: "p" }), null);
  assert.equal(
    resolveGhlSiteSupportTarget({ GHL_SITE_PIPELINE_ID: "p", GHL_SITE_SUPPORT_STAGE_ID: "fd5410ec-da7b-48a7-8f34-32f3f58045c7" }),
    null,
  );
});

test("tour request: upsert + form:tour, and the tour files the parent", async () => {
  const { calls, result } = await sendForm("tour");
  assertUpsertAndTag(calls, result, "tour");
  assert.equal(result.opportunity, "none");
  const fn = serverFn("src/lib/server/tours.ts", "export const createTourRequest", "export const listTourRequests");
  assert.match(fn, /captureFormLead\(\{ form: "tour", userId: context\.userId, parentAction: true \}\)/);
});

test("info request and tour interest: upsert + form:info", async () => {
  const { calls, result } = await sendForm("info");
  assertUpsertAndTag(calls, result, "info");
  const info = serverFn("src/lib/server/lead-requests.ts", "export const createInfoRequest", "export const createTourInterest");
  assert.match(info, /form: "info"/);
  assert.match(info, /email: contact\.email/);
  const interest = serverFn("src/lib/server/lead-requests.ts", "export const createTourInterest", "export const updateLeadRequest");
  assert.match(interest, /form: "info"/);
  const lead = serverFn("src/lib/server/lead-requests.ts", "export const createLeadRequest", "export const createInfoRequest");
  assert.match(lead, /captureFormLead\(\{ form: leadKindGhlForm\(data\.kind\), userId: context\.userId, parentAction: true \}\)/);
});

test("daycare waitlist and waitlist alerts: upsert + form:waitlist", async () => {
  const { calls, result } = await sendForm("waitlist");
  assertUpsertAndTag(calls, result, "waitlist");
  const join = serverFn("src/lib/server/spot-offers.ts", "export const joinDaycareWaitlist", "export const withdrawDaycareWaitlist");
  assert.match(join, /captureFormLead\(\{ form: "waitlist", userId: context\.userId, parentAction: true \}\)/);
  const alerts = serverFn("src/lib/server/waitlist-api.ts", "export const setWaitlistInterest", "export const getWaitlistPulseStatus");
  assert.match(alerts, /captureFormLead\(\{ form: "waitlist", userId: context\.userId, parentAction: true \}\)/);
});

test("spot request: upsert + form:spot", async () => {
  const { calls, result } = await sendForm("spot");
  assertUpsertAndTag(calls, result, "spot");
  const fn = serverFn("src/lib/server/family.ts", "export const createSpotRequest", "export const listInbox");
  assert.match(fn, /captureFormLead\(\{ form: "spot", userId: context\.userId, parentAction: true \}\)/);
});

test("start a claim: upsert + form:claim-start, no Daycare Sign Up card or role change", async () => {
  const { calls, result } = await sendForm("claim-start", { company: "Fake Kids Centre" });
  assertUpsertAndTag(calls, result, "claim-start");
  const upsert = calls.find((call) => call.url.endsWith("/contacts/upsert"));
  assert.equal(upsert.body.companyName, "Fake Kids Centre");
  assert.equal(calls.some((call) => call.url.includes("/opportunities")), false);
  const fn = serverFn("src/lib/server/claims.ts", "export const startClaim", "export const verifyClaim");
  assert.match(fn, /captureFormLead\(\{ form: "claim-start", userId: context\.userId, company: listed\.name \}\)/);
  assert.doesNotMatch(fn, /ensureCrmIntake\(|writeProfileRole\(|syncDaycareCrm\(/);
});

test("job applications: upsert + form:job-apply", async () => {
  const { calls, result } = await sendForm("job-apply");
  assertUpsertAndTag(calls, result, "job-apply");
  const ece = serverFn("src/lib/server/ece-jobs.ts", "export const applyToEceJob", "export const listMyEceApplicants");
  assert.match(ece, /form: "job-apply"/);
  const staff = serverFn("src/lib/server/staff-jobs.ts", "export const applyToStaffJob", "export const answerStaffJobInvite");
  assert.match(staff, /form: "job-apply"/);
});

test("forms stay off without the lead push flag or token and never touch centre_leads", async () => {
  const { calls, fetchImpl } = mockGhl();
  const off = await postGhlFormLead({ form: "tour", email: "a@example.com", env: { GHL_API_TOKEN: "pit-fake" }, fetchImpl });
  assert.deepEqual(off, { ok: true, skipped: true, reason: "flag-off" });
  const noToken = await postGhlFormLead({ form: "tour", email: "a@example.com", env: { FEATURE_GHL_LEAD_PUSH: "1" }, fetchImpl });
  assert.deepEqual(noToken, { ok: true, skipped: true, reason: "no-api-token" });
  const intakeOff = await postGhlFormLead({
    form: "tour",
    email: "a@example.com",
    env: { FEATURE_GHL_LEAD_PUSH: "1", FEATURE_GHL_INTAKE: "0", GHL_API_TOKEN: "pit-fake" },
    fetchImpl,
  });
  assert.deepEqual(intakeOff, { ok: true, skipped: true, reason: "intake-off" });
  assert.equal(calls.length, 0);
  for (const rel of ["src/lib/ghl-form-lead.ts", "src/lib/server/ghl-form-lead.ts"]) {
    const text = src(rel);
    assert.doesNotMatch(text, /createOrUpdateLead|rememberCentreLead|insert into centre_leads|\/workflows/);
  }
});
