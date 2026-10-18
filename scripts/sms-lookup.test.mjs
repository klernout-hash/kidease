import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test as nodeTest } from "node:test";
import { decideSmsLookup, lineTypeBlocksSms, lineTypeFromLookupBody } from "../src/lib/sms-lookup.ts";
import { smsOptInWasBlocked } from "../src/lib/parent-sms-consent.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(root, rel), "utf8");

const env = {
  TWILIO_ACCOUNT_SID: "ACtestlookupsidnotreal",
  TWILIO_AUTH_TOKEN: "test_lookup_token_not_real",
};

function lookupFetch(type, extra = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return {
      ok: extra.ok !== false,
      status: extra.status ?? 200,
      json: async () =>
        extra.body ?? {
          line_type_intelligence: {
            type,
            error_code: extra.errorCode ?? null,
          },
        },
    };
  };
  return { fetchImpl, calls };
}

nodeTest("landline and nonFixedVoip cannot get texts; other types can", () => {
  assert.equal(lineTypeBlocksSms("landline"), true);
  assert.equal(lineTypeBlocksSms("nonFixedVoip"), true);
  assert.equal(lineTypeBlocksSms("mobile"), false);
  assert.equal(lineTypeBlocksSms("fixedVoip"), false);
  assert.equal(lineTypeBlocksSms("unknown"), false);
  assert.equal(lineTypeBlocksSms(""), false);
  assert.equal(lineTypeBlocksSms(null), false);
  assert.deepEqual(lineTypeFromLookupBody({ line_type_intelligence: { type: "mobile", error_code: null } }), {
    type: "mobile",
    failed: false,
  });
  assert.equal(lineTypeFromLookupBody({ line_type_intelligence: { error_code: 60600 } }).failed, true);
  assert.equal(lineTypeFromLookupBody({}).failed, true);
});

nodeTest("Lookup v2 uses E.164, Fields=line_type_intelligence, and the account token", async () => {
  const { fetchImpl, calls } = lookupFetch("mobile");
  const decision = await decideSmsLookup("204-555-0199", { env, fetchImpl });
  assert.equal(decision.block, false);
  assert.equal(decision.failOpen, false);
  assert.equal(decision.lineType, "mobile");
  assert.equal(decision.phone, "+12045550199");
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.origin + url.pathname, "https://lookups.twilio.com/v2/PhoneNumbers/%2B12045550199");
  assert.equal(url.searchParams.get("Fields"), "line_type_intelligence");
  const header = calls[0].init.headers.Authorization;
  assert.equal(Buffer.from(header.replace(/^Basic /, ""), "base64").toString("utf8"), `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
  assert.equal(calls[0].url.includes(env.TWILIO_AUTH_TOKEN), false);
});

nodeTest("landline and non-fixed VoIP block SMS; a Lookup error fails open", async () => {
  const land = lookupFetch("landline");
  const landline = await decideSmsLookup("+14165550100", { env, fetchImpl: land.fetchImpl });
  assert.equal(landline.block, true);
  assert.equal(landline.lineType, "landline");
  assert.equal(landline.failOpen, false);

  const voip = lookupFetch("nonFixedVoip");
  const nonFixed = await decideSmsLookup("+16045550100", { env, fetchImpl: voip.fetchImpl });
  assert.equal(nonFixed.block, true);
  assert.equal(nonFixed.lineType, "nonFixedVoip");

  const down = lookupFetch("mobile", { ok: false, status: 500, body: {} });
  const http = await decideSmsLookup("+12045550199", { env, fetchImpl: down.fetchImpl });
  assert.equal(http.block, false);
  assert.equal(http.failOpen, true);
  assert.equal(http.phone, "+12045550199");

  const thrown = await decideSmsLookup("+12045550199", {
    env,
    fetchImpl: async () => {
      throw new Error("network");
    },
  });
  assert.equal(thrown.block, false);
  assert.equal(thrown.failOpen, true);

  const coded = lookupFetch("landline", { errorCode: 60600 });
  const packageError = await decideSmsLookup("+12045550199", { env, fetchImpl: coded.fetchImpl });
  assert.equal(packageError.block, false);
  assert.equal(packageError.failOpen, true);

  let called = 0;
  const missing = await decideSmsLookup("204-555-0199", {
    env: { TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID },
    fetchImpl: async () => {
      called += 1;
      return { ok: true, json: async () => ({}) };
    },
  });
  assert.equal(called, 0);
  assert.equal(missing.block, false);
  assert.equal(missing.failOpen, true);
});

nodeTest("signup and settings ask Lookup before SMS is turned on, and say so in plain words", () => {
  const signup = src("src/lib/server/parent-sms-consent.ts");
  const settings = src("src/lib/server/casl-consent-api.ts");
  const lookup = src("src/lib/sms-lookup.ts");
  assert.match(signup, /decideSmsLookup/);
  assert.match(signup, /smsUnreachable/);
  assert.match(settings, /decideSmsLookup/);
  assert.match(settings, /grantSms = false/);
  assert.match(lookup, /Fields=line_type_intelligence/);
  assert.match(lookup, /TWILIO_ACCOUNT_SID/);
  assert.match(lookup, /TWILIO_AUTH_TOKEN/);
  assert.doesNotMatch(lookup, /console\.(log|info|debug|warn|error)/);
  assert.match(src("src/routes/account.tsx"), /smsUnreachable/);
  assert.match(src("src/components/parent-signup-form.tsx"), /smsOptInWasBlocked/);
  assert.match(src("src/routes/login.tsx"), /smsOptInWasBlocked/);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /smsUnreachable: "Texts can't reach that number\. Use a mobile phone that can get text messages\."/);
  assert.match(copy, /smsUnreachable: "Les textos ne peuvent pas joindre ce numéro\./);
  assert.equal(smsOptInWasBlocked({ smsUnreachable: true }), true);
  assert.equal(smsOptInWasBlocked({ ok: true, smsConsent: true }), false);
  assert.equal(smsOptInWasBlocked(undefined), false);
});
