import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { smsEnabled } from "../src/lib/features.ts";
import {
  isE164,
  normalizeE164,
  SMS_CREDENTIALS_MESSAGE,
  SMS_ENV_NAMES,
  SMS_SCAFFOLD_MESSAGE,
  smsCredentialsPresent,
  smsEnvPresence,
  smsLive,
} from "../src/lib/sms.ts";
import {
  billReminderSmsBody,
  claimStatusSmsBody,
  notifyClaimStatusSms,
  sendSms,
  vacancySmsBody,
} from "../src/lib/server/sms.ts";
import {
  parseTwilioForm,
  publicRequestUrl,
  summarizeSmsStatus,
  TwilioSignatureError,
  validateTwilioSignature,
} from "../src/lib/server/sms-status.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const LIVE_ENV = {
  FEATURE_SMS: "1",
  TWILIO_ACCOUNT_SID: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  TWILIO_AUTH_TOKEN: "test_auth_token_not_real",
  TWILIO_FROM_NUMBER: "+12045550100",
};

function signed(url, params, token) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return createHmac("sha1", token).update(Buffer.from(data, "utf8")).digest("base64");
}

test("FEATURE_SMS defaults off", () => {
  assert.equal(smsEnabled({}), false);
  assert.equal(smsEnabled({ FEATURE_SMS: "0" }), false);
  assert.equal(smsEnabled({ FEATURE_SMS: "1" }), true);
  assert.equal(smsLive({}), false);
  assert.equal(smsLive(LIVE_ENV), true);
});

test("sendSms no-ops when FEATURE_SMS is off and does not call Twilio", async () => {
  let called = 0;
  const fetchImpl = async () => {
    called += 1;
    throw new Error("should not fetch");
  };
  const result = await sendSms(
    { to: "+12045550199", body: "Vacancy: 2 toddler spots" },
    { env: { ...LIVE_ENV, FEATURE_SMS: "0" }, fetchImpl },
  );
  assert.equal(called, 0);
  assert.deepEqual(result, { ok: false, skipped: true, error: SMS_SCAFFOLD_MESSAGE });
});

test("sendSms no-ops when credentials are missing even if the flag is on", async () => {
  let called = 0;
  const result = await sendSms(
    { to: "+12045550199", body: "Claim approved" },
    {
      env: { FEATURE_SMS: "1" },
      fetchImpl: async () => {
        called += 1;
        return new Response("nope");
      },
    },
  );
  assert.equal(called, 0);
  assert.equal(result.ok, false);
  assert.equal(result.skipped, true);
  assert.equal(result.error, SMS_CREDENTIALS_MESSAGE);
});

test("sendSms rejects non-E.164 without fetching", async () => {
  let called = 0;
  const result = await sendSms(
    { to: "not-a-phone", body: "hi" },
    {
      env: LIVE_ENV,
      fetchImpl: async () => {
        called += 1;
        return new Response("nope");
      },
    },
  );
  assert.equal(called, 0);
  assert.equal(result.ok, false);
  assert.equal(result.skipped, false);
  assert.match(result.error, /E\.164/);
});

test("normalizeE164 accepts NANP and Canadian +1", () => {
  assert.equal(normalizeE164("204-555-0199"), "+12045550199");
  assert.equal(normalizeE164("+1 (204) 555-0199"), "+12045550199");
  assert.equal(isE164("+12045550199"), true);
  assert.equal(isE164("12045550199"), false);
  assert.equal(isE164(""), false);
});

test("sendSms posts to Twilio with Messaging Service when configured", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ sid: "SMbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", status: "queued" }), {
      status: 201,
    });
  };
  const result = await sendSms(
    { to: "+12045550199", body: "KidEase claim update" },
    {
      env: {
        FEATURE_SMS: "1",
        TWILIO_ACCOUNT_SID: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        TWILIO_API_KEY_SID: "SKcccccccccccccccccccccccccccccccc",
        TWILIO_API_KEY_SECRET: "api_key_secret_not_real",
        TWILIO_MESSAGING_SERVICE_SID: "MGdddddddddddddddddddddddddddddddd",
        TWILIO_STATUS_CALLBACK_URL: "https://www.kidease.ca/api/sms/status",
      },
      fetchImpl,
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.sid.startsWith("SM"), true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /Accounts\/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\/Messages\.json/);
  const body = String(calls[0].init.body);
  assert.match(body, /MessagingServiceSid=MG/);
  assert.doesNotMatch(body, /api_key_secret_not_real/);
  assert.doesNotMatch(body, /From=/);
  assert.match(body, /StatusCallback=/);
  const auth = calls[0].init.headers.Authorization;
  assert.match(auth, /^Basic /);
  assert.doesNotMatch(auth, /api_key_secret_not_real/);
});

test("notifyClaimStatusSms skips when there is no mobile", async () => {
  let called = 0;
  const result = await notifyClaimStatusSms({
    to: "",
    centreName: "Sunshine Daycare",
    status: "approved",
    env: LIVE_ENV,
    fetchImpl: async () => {
      called += 1;
      return new Response("nope");
    },
  });
  assert.equal(called, 0);
  assert.equal(result.skipped, true);
});

test("transactional copy stays short and includes STOP", () => {
  assert.match(claimStatusSmsBody("Sunshine Daycare", "approved"), /STOP/);
  assert.match(vacancySmsBody("Sunshine Daycare", "2 toddler spots"), /STOP/);
  assert.match(billReminderSmsBody("$820", "https://kidease.ca/pay/bill/x"), /STOP/);
  assert.doesNotMatch(claimStatusSmsBody("Sunshine", "approved"), /unsubscribe from deals|limited time/i);
});

test("Twilio signature validation matches the documented HMAC-SHA1 scheme", () => {
  const url = "https://www.kidease.ca/api/sms/status";
  const params = { MessageSid: "SMeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", MessageStatus: "delivered" };
  const token = "test_auth_token_not_real";
  const sig = signed(url, params, token);
  assert.equal(validateTwilioSignature(token, sig, url, params), true);
  assert.equal(validateTwilioSignature(token, sig, url, { ...params, MessageStatus: "failed" }), false);
  assert.throws(() => validateTwilioSignature("", sig, url, params), TwilioSignatureError);
  assert.deepEqual(summarizeSmsStatus(params), {
    ok: true,
    messageSid: params.MessageSid,
    messageStatus: "delivered",
  });
  assert.deepEqual(parseTwilioForm("MessageStatus=sent&MessageSid=SM1"), {
    MessageStatus: "sent",
    MessageSid: "SM1",
  });
});

test("publicRequestUrl prefers the configured callback URL", () => {
  const request = new Request("http://127.0.0.1/api/sms/status", {
    headers: { host: "127.0.0.1", "x-forwarded-proto": "https", "x-forwarded-host": "www.kidease.ca" },
  });
  assert.equal(publicRequestUrl(request, "https://www.kidease.ca/api/sms/status"), "https://www.kidease.ca/api/sms/status");
  assert.equal(publicRequestUrl(request), "https://www.kidease.ca/api/sms/status");
});

test("env example lists Twilio names only and FEATURE_SMS is off", () => {
  const envExample = readFileSync(join(root, ".env.example"), "utf8");
  const sms = readFileSync(join(root, "src/lib/sms.ts"), "utf8");
  const send = readFileSync(join(root, "src/lib/server/sms.ts"), "utf8");
  for (const name of SMS_ENV_NAMES) {
    assert.match(envExample, new RegExp(`${name}=`));
    assert.match(sms, new RegExp(name));
  }
  assert.match(envExample, /FEATURE_SMS=0/);
  const twilioBlock = envExample.slice(envExample.indexOf("# Twilio transactional SMS"));
  assert.doesNotMatch(twilioBlock, /TWILIO_AUTH_TOKEN=\S+/);
  assert.doesNotMatch(twilioBlock, /TWILIO_API_KEY_SECRET=\S+/);
  assert.doesNotMatch(twilioBlock, /sk_live_/);
  assert.doesNotMatch(twilioBlock, /AC[0-9a-fA-F]{32}/);
  assert.match(sms, /do not invent credentials/i);
  assert.match(send, /Never log TWILIO_AUTH_TOKEN/);
  assert.doesNotMatch(send, /console\.\w+\([^)]*AUTH_TOKEN/);
  assert.equal(smsEnvPresence({}).credentialsPresent, false);
  assert.equal(smsCredentialsPresent(LIVE_ENV), true);
});

test("Bills and Stripe paths do not import the SMS module", () => {
  const billing = readFileSync(join(root, "src/lib/server/billing.ts"), "utf8");
  const stripe = readFileSync(join(root, "src/lib/server/stripe-checkout.ts"), "utf8");
  const webhook = readFileSync(join(root, "src/routes/api/stripe.webhook.ts"), "utf8");
  assert.doesNotMatch(billing, /@\/lib\/server\/sms/);
  assert.doesNotMatch(stripe, /@\/lib\/server\/sms/);
  assert.doesNotMatch(webhook, /@\/lib\/server\/sms/);
});

test("notify and claim decision hook sendSms behind the flag", () => {
  const notify = readFileSync(join(root, "src/lib/server/notify.ts"), "utf8");
  const centres = readFileSync(join(root, "src/lib/server/admin-centres.ts"), "utf8");
  assert.match(notify, /from "@\/lib\/server\/sms"/);
  assert.match(notify, /sendSms\(/);
  assert.doesNotMatch(notify, /btoa\(`\$\{sid\}:\$\{token\}`\)/);
  assert.match(centres, /notifyClaimStatusSms/);
});

test("status webhook route is registered and not a *.server.* client import", () => {
  const route = readFileSync(join(root, "src/routes/api/sms.status.ts"), "utf8");
  const tree = readFileSync(join(root, "src/routeTree.gen.ts"), "utf8");
  const lab = readFileSync(join(root, "src/lib/server/chat-scaffold.ts"), "utf8");
  assert.match(route, /createFileRoute\("\/api\/sms\/status"\)/);
  assert.match(route, /validateTwilioSignature/);
  assert.match(tree, /from '\.\/routes\/api\/sms\.status'/);
  assert.match(tree, /id:\s*'\/api\/sms\/status'/);
  assert.match(lab, /smsEnabled/);
  assert.doesNotMatch(lab, /sms\.server/);
});
