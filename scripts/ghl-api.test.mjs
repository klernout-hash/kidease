import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  GHL_API_USER_AGENT,
  GHL_API_VERSION,
  GHL_DEFAULT_DAYCARE_PIPELINE_ID,
  GHL_DEFAULT_DAYCARE_SIGNED_UP_STAGE_ID,
  GHL_DEFAULT_LOCATION_ID,
  GHL_DEFAULT_PARENT_PIPELINE_ID,
  GHL_DEFAULT_PARENT_SIGNED_UP_STAGE_ID,
  GHL_FORBIDDEN_APPROVED_STAGE_ID,
  buildGhlContactUpsertBody,
  buildGhlOpportunityBody,
  ghlApiContactTags,
  isForbiddenApprovedStage,
  postGhlCrmSignup,
  resolveGhlApiTarget,
} from "../src/lib/ghl-api.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function route(url, init, calls) {
  calls.push({
    url: String(url),
    method: init.method,
    headers: init.headers,
    body: init.body ? JSON.parse(String(init.body)) : null,
  });
  const path = String(url);
  if (path.endsWith("/contacts/upsert")) return jsonResponse({ contact: { id: "contact_1" }, new: true });
  if (path.includes("/contacts/") && path.endsWith("/tags")) return jsonResponse({ tags: [] });
  if (path.includes("/opportunities/search")) return jsonResponse({ opportunities: [] });
  if (path.includes("/opportunities")) return jsonResponse({ opportunity: { id: "opp_1" } }, 201);
  return jsonResponse({ error: "unexpected" }, 500);
}

test("API no-ops without a token and when the kill switch is off", async () => {
  let fetches = 0;
  const fetchImpl = async () => {
    fetches += 1;
    return jsonResponse({});
  };
  const missing = await postGhlCrmSignup({
    trigger: "provider_signup",
    email: "joan@kids.ca",
    env: {},
    fetchImpl,
  });
  assert.deepEqual(missing, { ok: true, skipped: true, reason: "no-api-token" });
  const flagged = await postGhlCrmSignup({
    trigger: "provider_signup",
    email: "joan@kids.ca",
    env: { FEATURE_GHL_INTAKE: "0", GHL_API_TOKEN: "pit-test" },
    fetchImpl,
  });
  assert.deepEqual(flagged, { ok: true, skipped: true, reason: "flag-off" });
  assert.equal(fetches, 0);
});

test("token alone creates a Daycare Sign Up opportunity at Signed up", async () => {
  const calls = [];
  const result = await postGhlCrmSignup({
    trigger: "provider_signup",
    email: "kidsworlddaycare2025@gmail.com",
    name: "Joan Mbabazi",
    phone: "2045550100",
    company: "Kids World Daycare",
    eventId: "ev_joan",
    env: { GHL_API_TOKEN: "pit-test" },
    fetchImpl: async (url, init) => route(url, init, calls),
  });
  assert.deepEqual(result, { ok: true, skipped: false, contactId: "contact_1", opportunity: "created" });
  assert.equal(calls[0].url, "https://services.leadconnectorhq.com/contacts/upsert");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers.Authorization, "Bearer pit-test");
  assert.equal(calls[0].headers.Version, GHL_API_VERSION);
  assert.equal(calls[0].headers["User-Agent"], GHL_API_USER_AGENT);
  assert.match(calls[0].headers["User-Agent"], /Mozilla/);
  assert.equal(calls[0].body.locationId, "hkAJnVH8EJpMcgq9bNjG");
  assert.equal(calls[0].body.email, "kidsworlddaycare2025@gmail.com");
  assert.equal(calls[0].body.firstName, "Joan");
  assert.equal(calls[0].body.lastName, "Mbabazi");
  assert.equal(calls[0].body.phone, "2045550100");
  assert.equal(calls[0].body.companyName, "Kids World Daycare");
  assert.equal(calls[0].body.tags, undefined);
  const tagCall = calls.find((call) => call.method === "POST" && call.url.endsWith("/tags"));
  assert.deepEqual(tagCall.body.tags, [
    "source:website",
    "type:daycare",
    "form:signup",
    "claim:claimed",
  ]);
  const unclaim = calls.find((call) => call.method === "DELETE" && call.url.endsWith("/tags"));
  assert.deepEqual(unclaim.body.tags, ["claim:unclaimed"]);
  const search = calls.find((call) => call.url.includes("/opportunities/search"));
  assert.match(search.url, /location_id=hkAJnVH8EJpMcgq9bNjG/);
  assert.match(search.url, /pipeline_id=y95txOBNvB7hOMMcXggS/);
  assert.match(search.url, /contact_id=contact_1/);
  assert.doesNotMatch(search.url, /[?&]locationId=/);
  assert.doesNotMatch(search.url, /[?&]pipelineId=/);
  assert.doesNotMatch(search.url, /[?&]contactId=/);
  const opportunity = calls.find((call) => call.method === "POST" && call.url.endsWith("/opportunities/"));
  assert.equal(opportunity.body.locationId, GHL_DEFAULT_LOCATION_ID);
  assert.equal(opportunity.body.pipelineId, GHL_DEFAULT_DAYCARE_PIPELINE_ID);
  assert.equal(opportunity.body.pipelineStageId, GHL_DEFAULT_DAYCARE_SIGNED_UP_STAGE_ID);
  assert.equal(opportunity.body.contactId, "contact_1");
  assert.equal(opportunity.body.name, "Kids World Daycare");
  assert.equal(opportunity.body.status, "open");
  assert.notEqual(opportunity.body.pipelineStageId, GHL_FORBIDDEN_APPROVED_STAGE_ID);
  assert.equal(
    calls.some((call) => JSON.stringify(call.body || {}).includes(GHL_FORBIDDEN_APPROVED_STAGE_ID)),
    false,
  );
});

test("parent signup uses Parent Onboard Signed up and does not tag claim:claimed", async () => {
  const calls = [];
  const result = await postGhlCrmSignup({
    trigger: "parent_signup",
    email: "sam@family.ca",
    name: "Sam Parent",
    env: { GHL_API_TOKEN: "Bearer pit-parent" },
    fetchImpl: async (url, init) => route(url, init, calls),
  });
  assert.equal(result.ok, true);
  assert.equal(calls[0].headers.Authorization, "Bearer pit-parent");
  const opportunity = calls.find((call) => call.method === "POST" && call.url.endsWith("/opportunities/"));
  assert.equal(opportunity.body.pipelineId, GHL_DEFAULT_PARENT_PIPELINE_ID);
  assert.equal(opportunity.body.pipelineStageId, GHL_DEFAULT_PARENT_SIGNED_UP_STAGE_ID);
  assert.equal(opportunity.body.name, "Sam Parent");
  assert.equal(opportunity.body.status, "open");
  const tagCall = calls.find((call) => call.method === "POST" && call.url.endsWith("/tags"));
  assert.deepEqual(tagCall.body.tags, ["source:website", "type:parent", "form:signup"]);
  assert.equal(
    calls.some((call) => call.method === "DELETE"),
    false,
  );
});

test("existing pipeline opportunity is not created again and Approved is refused", async () => {
  const calls = [];
  const exists = await postGhlCrmSignup({
    trigger: "claim_verify",
    email: "joan@kids.ca",
    company: "Kids World Daycare",
    env: { GHL_API_TOKEN: "pit-test" },
    fetchImpl: async (url, init) => {
      const path = String(url);
      if (path.includes("/opportunities/search")) {
        calls.push({ url: path, method: init.method });
        return jsonResponse({
          opportunities: [{ id: "opp_existing", pipelineId: GHL_DEFAULT_DAYCARE_PIPELINE_ID }],
        });
      }
      return route(url, init, calls);
    },
  });
  assert.deepEqual(exists, { ok: true, skipped: false, contactId: "contact_1", opportunity: "exists" });
  assert.equal(
    calls.some((call) => call.method === "POST" && String(call.url).includes("/opportunities")),
    false,
  );

  let forbiddenFetches = 0;
  const refused = await postGhlCrmSignup({
    trigger: "provider_signup",
    email: "joan@kids.ca",
    env: {
      GHL_API_TOKEN: "pit-test",
      GHL_DAYCARE_SIGNED_UP_STAGE_ID: GHL_FORBIDDEN_APPROVED_STAGE_ID.toUpperCase(),
    },
    fetchImpl: async () => {
      forbiddenFetches += 1;
      return jsonResponse({});
    },
  });
  assert.deepEqual(refused, { ok: false, error: "refusing Approved stage" });
  assert.equal(forbiddenFetches, 0);
  assert.equal(isForbiddenApprovedStage(GHL_FORBIDDEN_APPROVED_STAGE_ID), true);
  assert.equal(isForbiddenApprovedStage(GHL_DEFAULT_DAYCARE_SIGNED_UP_STAGE_ID), false);
});

test("pipeline overrides apply and HTTP failures never throw", async () => {
  const env = {
    GHL_API_TOKEN: "pit-test",
    GHL_LOCATION_ID: "locOverride",
    GHL_PARENT_PIPELINE_ID: "pipeParent",
    GHL_PARENT_SIGNED_UP_STAGE_ID: "stageParentSignedUp",
  };
  assert.deepEqual(resolveGhlApiTarget("parent", env), {
    locationId: "locOverride",
    pipelineId: "pipeParent",
    pipelineStageId: "stageParentSignedUp",
  });
  assert.equal(resolveGhlApiTarget("daycare", { GHL_API_TOKEN: "pit-test" }).locationId, GHL_DEFAULT_LOCATION_ID);
  assert.deepEqual(ghlApiContactTags("enroll"), [
    "source:website",
    "type:daycare",
    "form:signup",
    "form:enroll",
    "claim:claimed",
  ]);
  const built = buildGhlOpportunityBody({
    trigger: "parent_signup",
    contactId: "contact_9",
    name: "Sam Parent",
    email: "sam@family.ca",
    env,
  });
  assert.equal(built.pipelineStageId, "stageParentSignedUp");
  assert.equal(built.status, "open");
  assert.equal("tags" in buildGhlContactUpsertBody({
    trigger: "parent_signup",
    email: "sam@family.ca",
    env,
  }), true);

  let attempts = 0;
  const retried = await postGhlCrmSignup({
    trigger: "parent_signup",
    email: "sam@family.ca",
    name: "Sam Parent",
    env: { GHL_API_TOKEN: "pit-test" },
    fetchImpl: async (url, init) => {
      attempts += 1;
      if (String(url).endsWith("/contacts/upsert") && attempts === 1) return jsonResponse({ message: "down" }, 503);
      return route(url, init, []);
    },
  });
  assert.equal(retried.opportunity, "created");
  assert.ok(attempts >= 2);

  const failed = await postGhlCrmSignup({
    trigger: "provider_signup",
    email: "joan@kids.ca",
    env: { GHL_API_TOKEN: "pit-test" },
    fetchImpl: async () => {
      throw new Error("network down");
    },
  });
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.match(failed.error, /network down/);
});

test("test listings still sync and are tagged qa:test", async () => {
  const calls = [];
  const result = await postGhlCrmSignup({
    trigger: "provider_signup",
    email: "qa@kidease.ca",
    company: "TEST Ghost Claim Lab",
    testListing: true,
    env: { GHL_API_TOKEN: "pit-test" },
    fetchImpl: async (url, init) => route(url, init, calls),
  });
  assert.equal(result.opportunity, "created");
  const tagCall = calls.find((call) => call.method === "POST" && call.url.endsWith("/tags"));
  assert.ok(tagCall.body.tags.includes("qa:test"));
  assert.ok(tagCall.body.tags.includes("claim:claimed"));
  assert.equal(tagCall.body.tags.at(-1), "qa:test");
  const opportunity = calls.find((call) => call.method === "POST" && call.url.endsWith("/opportunities/"));
  assert.equal(opportunity.body.pipelineStageId, GHL_DEFAULT_DAYCARE_SIGNED_UP_STAGE_ID);
});

test("docs keep Signed up as the only automatic stage", () => {
  const example = src(".env.example");
  const api = src("src/lib/ghl-api.ts");
  assert.match(example, /GHL_API_TOKEN=/);
  assert.match(example, /GHL_LOCATION_ID=hkAJnVH8EJpMcgq9bNjG/);
  assert.match(example, /Signed up only/);
  assert.match(example, /Never Approved/);
  assert.match(example, /Auto-Approved is forbidden/);
  assert.match(api, /Never Approved/);
  assert.match(api, new RegExp(GHL_DEFAULT_DAYCARE_SIGNED_UP_STAGE_ID));
  assert.match(api, new RegExp(GHL_FORBIDDEN_APPROVED_STAGE_ID));
  assert.match(src("src/lib/server/ghl-intake.ts"), /postGhlCrmSignup/);
  assert.match(src("src/lib/server/ghl-intake.ts"), /postGhlSignupIntake/);
});
