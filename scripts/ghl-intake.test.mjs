import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  buildGhlSignupPayload,
  ghlAudienceForTrigger,
  ghlIntakeEnabled,
  ghlIntakeTags,
  postGhlSignupIntake,
  resolveGhlWebhookUrl,
  shouldPostGhlIntake,
} from "../src/lib/ghl-intake.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("webhook helper no-ops cleanly without env", async () => {
  const env = {};
  assert.equal(ghlIntakeEnabled(env), true);
  assert.equal(resolveGhlWebhookUrl("parent", env), null);
  assert.equal(resolveGhlWebhookUrl("daycare", env), null);
  assert.equal(shouldPostGhlIntake("parent", env), false);
  let fetches = 0;
  const result = await postGhlSignupIntake({
    trigger: "parent_signup",
    email: "sam@family.ca",
    name: "Sam Parent",
    eventId: "ev_1",
    env,
    fetchImpl: async () => {
      fetches += 1;
      return new Response("ok", { status: 200 });
    },
  });
  assert.deepEqual(result, { ok: true, skipped: true, reason: "no-webhook-url" });
  assert.equal(fetches, 0);
});

test("FEATURE_GHL_INTAKE=0 disables POSTs even when URLs are set", async () => {
  const env = {
    FEATURE_GHL_INTAKE: "0",
    GHL_WEBHOOK_PARENT_ONBOARD_URL: "https://example.com/parent",
  };
  assert.equal(ghlIntakeEnabled(env), false);
  let fetches = 0;
  const result = await postGhlSignupIntake({
    trigger: "parent_signup",
    email: "sam@family.ca",
    env,
    fetchImpl: async () => {
      fetches += 1;
      return new Response("ok", { status: 200 });
    },
  });
  assert.deepEqual(result, { ok: true, skipped: true, reason: "flag-off" });
  assert.equal(fetches, 0);
});

test("one router URL receives both parent and daycare events", () => {
  const daycareOnly = { GHL_WEBHOOK_DAYCARE_SIGNUP_URL: "https://hooks.example/daycare" };
  assert.equal(resolveGhlWebhookUrl("daycare", daycareOnly), "https://hooks.example/daycare");
  assert.equal(resolveGhlWebhookUrl("parent", daycareOnly), "https://hooks.example/daycare");
  const parentOnly = { GHL_WEBHOOK_PARENT_ONBOARD_URL: "https://hooks.example/parent" };
  assert.equal(resolveGhlWebhookUrl("parent", parentOnly), "https://hooks.example/parent");
  assert.equal(resolveGhlWebhookUrl("daycare", parentOnly), "https://hooks.example/parent");
});

test("payload is email, name, phone, company, tags, kidease_event_id", () => {
  assert.deepEqual(ghlIntakeTags("daycare"), ["source:website", "type:daycare", "form:signup"]);
  assert.deepEqual(ghlIntakeTags("parent"), ["source:website", "type:parent", "form:signup"]);
  assert.deepEqual(ghlIntakeTags("daycare", "claim_verify"), [
    "source:website",
    "type:daycare",
    "form:signup",
    "claim:claimed",
  ]);
  assert.deepEqual(ghlIntakeTags("daycare", "enroll"), [
    "source:website",
    "type:daycare",
    "form:signup",
    "form:enroll",
  ]);
  assert.equal(ghlAudienceForTrigger("parent_signup"), "parent");
  assert.equal(ghlAudienceForTrigger("provider_signup"), "daycare");
  assert.equal(ghlAudienceForTrigger("claim_verify"), "daycare");
  assert.equal(ghlAudienceForTrigger("enroll"), "daycare");
  assert.deepEqual(
    buildGhlSignupPayload({
      trigger: "provider_signup",
      email: "kidsworlddaycare2025@gmail.com",
      name: "Joan Mbabazi",
      phone: "",
      company: "Kids World Daycare",
      eventId: "ev_joan",
    }),
    {
      email: "kidsworlddaycare2025@gmail.com",
      name: "Joan Mbabazi",
      phone: "",
      company: "Kids World Daycare",
      tags: ["source:website", "type:daycare", "form:signup"],
      kidease_event_id: "ev_joan",
    },
  );
  assert.deepEqual(
    buildGhlSignupPayload({
      trigger: "claim_verify",
      email: "kidsworlddaycare2025@gmail.com",
      name: "Joan Mbabazi",
      company: "Kids World Daycare",
      eventId: "ev_claim",
    }).tags,
    ["source:website", "type:daycare", "form:signup", "claim:claimed"],
  );
  assert.deepEqual(
    buildGhlSignupPayload({
      trigger: "enroll",
      email: "joan@kids.ca",
      name: "Joan Mbabazi",
      phone: "2045550100",
      company: "Kids World Daycare",
      eventId: "ev_enroll",
    }),
    {
      email: "joan@kids.ca",
      name: "Joan Mbabazi",
      phone: "2045550100",
      company: "Kids World Daycare",
      tags: ["source:website", "type:daycare", "form:signup", "form:enroll"],
      kidease_event_id: "ev_enroll",
    },
  );
});

test("webhook POST is independent of Admin email and never throws", async () => {
  const env = { GHL_WEBHOOK_DAYCARE_SIGNUP_URL: "https://hooks.example/daycare" };
  const bodies = [];
  const sent = await postGhlSignupIntake({
    trigger: "provider_signup",
    email: "kidsworlddaycare2025@gmail.com",
    name: "Joan Mbabazi",
    company: "Kids World Daycare",
    eventId: "ev_failed_mail",
    env,
    fetchImpl: async (url, init) => {
      bodies.push({ url, body: JSON.parse(String(init.body)) });
      return new Response("ok", { status: 200 });
    },
  });
  assert.deepEqual(sent, { ok: true, skipped: false, status: 200 });
  assert.equal(bodies[0].url, "https://hooks.example/daycare");
  assert.equal(bodies[0].body.kidease_event_id, "ev_failed_mail");
  assert.deepEqual(bodies[0].body.tags, ["source:website", "type:daycare", "form:signup"]);

  const failed = await postGhlSignupIntake({
    trigger: "claim_verify",
    email: "kidsworlddaycare2025@gmail.com",
    name: "Joan Mbabazi",
    company: "Kids World Daycare",
    eventId: "ev_claim",
    env,
    fetchImpl: async () => {
      throw new Error("network down");
    },
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.match(failed.error, /network down/);
});

test("enroll posts to the daycare webhook and retries once on 5xx only", async () => {
  const env = { GHL_WEBHOOK_DAYCARE_SIGNUP_URL: "https://hooks.example/daycare" };
  const bodies = [];
  let calls = 0;
  const sent = await postGhlSignupIntake({
    trigger: "enroll",
    email: "joan@kids.ca",
    name: "Joan Mbabazi",
    phone: "2045550100",
    company: "Kids World Daycare",
    eventId: "ev_enroll",
    env,
    fetchImpl: async (url, init) => {
      calls += 1;
      bodies.push({ url, body: JSON.parse(String(init.body)), signal: init.signal });
      if (calls === 1) return new Response("unavailable", { status: 503 });
      return new Response("ok", { status: 200 });
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(sent, { ok: true, skipped: false, status: 200 });
  assert.equal(bodies[0].url, "https://hooks.example/daycare");
  assert.equal(bodies[1].body.company, "Kids World Daycare");
  assert.equal(bodies[1].body.kidease_event_id, "ev_enroll");
  assert.deepEqual(bodies[1].body.tags, ["source:website", "type:daycare", "form:signup", "form:enroll"]);
  assert.ok(bodies[0].signal);

  let bad = 0;
  const rejected = await postGhlSignupIntake({
    trigger: "claim_verify",
    email: "joan@kids.ca",
    company: "Kids World Daycare",
    eventId: "ev_claim",
    env,
    fetchImpl: async () => {
      bad += 1;
      return new Response("bad", { status: 400 });
    },
  });
  assert.equal(bad, 1);
  assert.deepEqual(rejected, { ok: false, error: "GHL 400" });
});

test("signup and claim verify fire GHL after notify, even when mail fails", () => {
  const family = src("src/lib/server/family.ts");
  const claims = src("src/lib/server/claims.ts");
  const ping = family.slice(family.indexOf("async function pingNewAccount"));
  assert.match(ping, /notifyNewAccountFromUser/);
  assert.match(ping, /captureSignupIntakeFromUser/);
  assert.match(ping, /provider_signup/);
  assert.match(ping, /parent_signup/);
  assert.match(ping, /account notify failed/);
  const ghlIdx = ping.indexOf("captureSignupIntakeFromUser");
  const mailIdx = ping.indexOf("afterNewAccountUserMail");
  assert.ok(ghlIdx > 0 && mailIdx > ghlIdx, "GHL intake must not depend on user-mail succeeding");
  assert.match(claims, /captureSignupIntakeFromUser/);
  assert.match(claims, /claim_verify/);
  assert.match(claims, /claim notify failed/);
  const enroll = claims.slice(claims.indexOf("export const submitEnrollLicense"));
  assert.match(enroll, /notifyPlatform/);
  assert.match(enroll, /enroll notify failed/);
  assert.match(enroll, /captureEnrollIntake/);
  const enrollGhl = enroll.indexOf("captureEnrollIntake");
  const enrollNotify = enroll.indexOf("notifyPlatform");
  assert.ok(enrollNotify >= 0 && enrollGhl > enrollNotify, "Enroll GHL runs beside Admin notify");
  assert.match(enroll, /if \(notifyError\) throw notifyError/);
  assert.match(src("src/lib/server/ghl-intake.ts"), /postGhlSignupIntake/);
  assert.match(src("src/lib/server/ghl-intake.ts"), /postGhlCrmSignup/);
  assert.match(src("src/lib/server/ghl-intake.ts"), /captureEnrollIntake/);
  assert.match(src("src/lib/ghl-intake.ts"), /runtimeProcessEnv/);
  assert.match(src("src/lib/ghl-intake.ts"), /claim:claimed/);
  assert.match(src(".env.example"), /GHL_WEBHOOK_DAYCARE_SIGNUP_URL=/);
  assert.match(src(".env.example"), /GHL_WEBHOOK_PARENT_ONBOARD_URL=/);
  assert.match(src(".env.example"), /claim:claimed/);
  assert.match(src(".env.example"), /Signed up only/);
  assert.match(src(".env.example"), /Never Approved/);
  assert.match(src("src/lib/ghl-intake.ts"), /Signed up only/);
  assert.match(src("src/lib/ghl-intake.ts"), /Never Approved/);
  const sample = buildGhlSignupPayload({
    trigger: "provider_signup",
    email: "joan@kids.ca",
    eventId: "ev_stage",
  });
  assert.equal("stage" in sample, false);
  assert.equal("approved" in sample, false);
});
