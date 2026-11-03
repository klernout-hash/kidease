import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import {
  amazonBuildOnAmazonDevice,
  loginWithAmazonAllowed,
  admRegistrationAllowed,
  fireKioskAllowed,
} from "../src/lib/amazon/gate.ts";
import { FLAG_DEFAULTS } from "../src/lib/flags.ts";
import { validAlexaCertUrl, timestampOk, signatureOk, handleAlexa, verifyAlexaRequest } from "../src/lib/server/alexa.ts";
import { KIOSK_COPY, validPin } from "../src/lib/amazon/kiosk-copy.ts";
import { SHIPPED_LOCALES } from "../src/lib/languages.ts";

const BASE = "Mozilla/5.0 (Linux; Android 11; KFTRWI) AppleWebKit/537.36 Chrome/120 Safari/537.36";
export const UA = {
  web: "Mozilla/5.0 (X11; Linux x86_64) Chrome/120 Safari/537.36",
  silk: "Mozilla/5.0 (Linux; Android 11; KFTRWI) AppleWebKit/537.36 Silk/120 like Chrome/120 Safari/537.36",
  ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) KidEaseNative",
  play: `${BASE} KidEaseNative`,
  samsung: `${BASE} KidEaseNative KidEaseStoreSamsung`,
  huawei: `${BASE} KidEaseNative KidEaseStoreHuawei KidEaseNoGms`,
  microsoft: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) KidEaseNative KidEaseStoreMicrosoft",
  amazonOtherMaker: `${BASE} KidEaseNative KidEaseStoreAmazon KidEaseNoGms`,
  amazonFire: `${BASE} KidEaseNative KidEaseStoreAmazon KidEaseNoGms KidEaseAmazonDevice`,
  forgedWeb: `${UA_WEB()} KidEaseAmazonDevice`,
};
function UA_WEB() {
  return "Mozilla/5.0 (X11; Linux x86_64) Chrome/120";
}
const ON = {
  FEATURE_LOGIN_AMAZON: "true",
  FEATURE_AMAZON_ADM: "true",
  FEATURE_PUSH: "true",
  FEATURE_FIRE_KIOSK: "true",
  FEATURE_CHILD_CHECKIN: "true",
  AMAZON_CLIENT_ID: "x",
  AMAZON_CLIENT_SECRET: "y",
};

test("Amazon flags default off", () => {
  for (const k of ["FEATURE_AMAZON_ADM", "FEATURE_LOGIN_AMAZON", "FEATURE_FIRE_KIOSK", "FEATURE_ALEXA_SKILL"]) {
    assert.equal(FLAG_DEFAULTS[k], false, k);
  }
});

test("Amazon features only on Amazon build + Amazon device", () => {
  for (const [name, ua] of Object.entries(UA)) {
    const expected = name === "amazonFire";
    const s = { userAgent: ua };
    assert.equal(amazonBuildOnAmazonDevice(s), expected, name);
    assert.equal(loginWithAmazonAllowed(ON, s), expected, `lwa ${name}`);
    assert.equal(admRegistrationAllowed(ON, s), expected, `adm ${name}`);
    assert.equal(fireKioskAllowed(ON, s), expected, `kiosk ${name}`);
  }
});

test("Amazon features off on Fire when flags are off", () => {
  const s = { userAgent: UA.amazonFire };
  assert.equal(loginWithAmazonAllowed({}, s), false);
  assert.equal(admRegistrationAllowed({}, s), false);
  assert.equal(fireKioskAllowed({}, s), false);
  assert.equal(loginWithAmazonAllowed({ FEATURE_LOGIN_AMAZON: "true" }, s), false, "needs LWA keys");
});

test("Alexa cert URL rules", () => {
  assert.ok(validAlexaCertUrl("https://s3.amazonaws.com/echo.api/echo-api-cert.pem"));
  for (const bad of [
    "http://s3.amazonaws.com/echo.api/echo-api-cert.pem",
    "https://notamazon.com/echo.api/echo-api-cert.pem",
    "https://s3.amazonaws.com/EcHo.aPi/echo-api-cert.pem",
    "https://s3.amazonaws.com:563/echo.api/echo-api-cert.pem",
    "https://s3.amazonaws.com/invalid.path/echo-api-cert.pem",
  ]) {
    assert.equal(validAlexaCertUrl(bad), false, bad);
  }
});

test("Alexa timestamp and signature", () => {
  const now = Date.parse("2026-11-02T12:00:00Z");
  assert.ok(timestampOk("2026-11-02T12:02:00Z", now));
  assert.equal(timestampOk("2026-11-02T12:03:00Z", now), false);
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const body = '{"a":1}';
  const sig = createSign("RSA-SHA256").update(body).sign(privateKey).toString("base64");
  assert.ok(signatureOk({ publicKey }, body, sig));
  assert.equal(signatureOk({ publicKey }, body + " ", sig), false);
});

test("Alexa endpoint off by default and needs skill id", async () => {
  const deps = { fetchCert: async () => "" };
  const h = { certUrl: "https://s3.amazonaws.com/echo.api/echo-api-cert.pem", signature: "x" };
  assert.equal((await verifyAlexaRequest({}, h, "{}", deps)).status, 404);
  assert.equal((await verifyAlexaRequest({ FEATURE_ALEXA_SKILL: "true" }, h, "{}", deps)).status, 503);
  const bad = await verifyAlexaRequest({ FEATURE_ALEXA_SKILL: "true", ALEXA_SKILL_ID: "s" }, { ...h, certUrl: "http://x" }, "{}", deps);
  assert.equal(bad.status, 400);
});

function intent(name, token, slots) {
  return {
    session: { user: token ? { accessToken: token } : {} },
    request: { type: "IntentRequest", timestamp: new Date().toISOString(), locale: "en-US", intent: { name, slots } },
  };
}
const data = {
  linkedUser: async (t) => (t === "parent" ? { userId: "u1", role: "parent" } : t === "staff" ? { userId: "u2", role: "provider" } : null),
  spotsNear: async () => ({ centres: 3, spots: 7 }),
  dayLogCount: async () => 2,
  newMessages: async () => 4,
};

test("Alexa day log needs a linked parent and never says names", async () => {
  const unlinked = await handleAlexa(intent("DayLogIntent"), data);
  assert.match(unlinked.response.outputSpeech.text, /link/i);
  assert.equal(unlinked.response.card.type, "LinkAccount");
  const staff = await handleAlexa(intent("DayLogIntent", "staff"), data);
  assert.match(staff.response.outputSpeech.text, /parents only/);
  const ok = await handleAlexa(intent("DayLogIntent", "parent"), { ...data, dayLogCount: async () => 2 });
  assert.equal(ok.response.outputSpeech.text, "You have 2 day log entries today. Open the app to read them.");
});

test("Alexa spots and messages", async () => {
  const spots = await handleAlexa(intent("FindSpotsIntent", "", { city: { value: "Winnipeg" } }), data);
  assert.match(spots.response.outputSpeech.text, /3 daycares in Winnipeg list 7 open spots/);
  const msgs = await handleAlexa(intent("NewMessagesIntent", "staff"), data);
  assert.match(msgs.response.outputSpeech.text, /4 new messages/);
  const parentMsgs = await handleAlexa(intent("NewMessagesIntent", "parent"), data);
  assert.match(parentMsgs.response.outputSpeech.text, /daycare staff/);
});

test("Kiosk copy covers all 10 locales and PIN rules", () => {
  for (const l of SHIPPED_LOCALES) assert.ok(KIOSK_COPY[l], l);
  assert.ok(validPin("1234"));
  assert.equal(validPin("12"), false);
  assert.equal(validPin("12ab"), false);
});
