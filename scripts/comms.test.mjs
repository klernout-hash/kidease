import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  brandKidEaseSms,
  chatBodyWithoutSmsFooter,
  daycareReplySms,
  inboundKeywordTwiml,
  inboundSmsChatDecision,
  parentMessageSms,
  parentRequestSms,
  smsConsentAllows,
  SMS_HELP_REPLY,
  SMS_HELP_REPLY_FR,
  SMS_START_REPLY,
  SMS_START_REPLY_FR,
  SMS_STOP_REPLY,
  SMS_STOP_REPLY_FR,
} from "../src/lib/sms-copy.ts";
import { CASL_ADDRESS_BLOCKED_MESSAGE, CASL_NO_CONSENT_MESSAGE } from "../src/lib/casl.ts";
import { smsDeliveryRecord } from "../src/lib/server/sms-status.ts";
import { sendSms } from "../src/lib/server/sms.ts";
import {
  clientDialTwiml,
  incomingVoiceTwiml,
  userIdFromVoiceIdentity,
  voiceCredentialsPresent,
  voiceIdentityForUser,
  VOICE_ENV_NAMES,
} from "../src/lib/voice.ts";
import { createVoiceAccessToken, decodeVoiceAccessTokenPayload } from "../src/lib/server/voice.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

const VOICE_ENV = {
  TWILIO_ACCOUNT_SID: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  TWILIO_API_KEY_SID: "SKbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  TWILIO_API_KEY_SECRET: "api_key_secret_not_real",
  TWILIO_TWIML_APP_SID: "APcccccccccccccccccccccccccccccc",
};

test("SMS consent fails closed and STOP beats a grant", () => {
  assert.equal(smsConsentAllows({ smsConsent: false, caslGranted: false, addressBlocked: false }).ok, false);
  assert.equal(smsConsentAllows({ smsConsent: true, caslGranted: false, addressBlocked: false }).ok, true);
  assert.equal(smsConsentAllows({ smsConsent: false, caslGranted: true, addressBlocked: false }).ok, true);
  const blocked = smsConsentAllows({ smsConsent: true, caslGranted: true, addressBlocked: true });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.reason, CASL_ADDRESS_BLOCKED_MESSAGE);
  const missing = smsConsentAllows({ smsConsent: false, caslGranted: false, addressBlocked: false });
  if (!missing.ok) assert.equal(missing.reason, CASL_NO_CONSENT_MESSAGE);
});

test("parent and daycare texts name KidEase and do not include a phone number", () => {
  for (const body of [parentRequestSms("Little Fox"), parentMessageSms("Little Fox"), daycareReplySms("Little Fox")]) {
    assert.match(body, /^KidEase:/);
    assert.match(body, /STOP/);
    assert.doesNotMatch(body, /\+1\d{10}/);
  }
  assert.equal(brandKidEaseSms("Hello there"), "KidEase: Hello there");
  assert.equal(brandKidEaseSms("KidEase: already"), "KidEase: already");
});

test("HELP replies only when Advanced Opt-Out did not", () => {
  const help = inboundKeywordTwiml({ Body: "HELP" }, "help");
  assert.match(help, /<Message>/);
  assert.match(help, /KidEase/);
  assert.match(help, /STOP/);
  assert.match(help, /1-877-502-7728/);
  assert.match(SMS_HELP_REPLY, /support@kidease\.ca/);
  for (const typed of ["HELP", "STOP", "START"]) {
    assert.equal(inboundKeywordTwiml({ OptOutType: typed, Body: typed }, typed.toLowerCase()).includes("<Message>"), false);
  }
  for (const line of [SMS_HELP_REPLY, SMS_STOP_REPLY, SMS_START_REPLY, SMS_HELP_REPLY_FR, SMS_STOP_REPLY_FR, SMS_START_REPLY_FR]) {
    assert.ok(line.length <= 160, line);
    assert.match(line, /KidEase/);
  }
});

test("inbound SMS never becomes a chat message", () => {
  const decision = inboundSmsChatDecision("tour Thursday");
  assert.equal(decision.insertIntoThread, false);
  assert.equal(decision.persistBody, false);
  assert.equal(inboundSmsChatDecision("HELP").insertIntoThread, false);
  const inbound = src("src/routes/api/sms.inbound.ts");
  assert.doesNotMatch(inbound, /insert into messages/);
  assert.doesNotMatch(inbound, /sendConnectedMessage/);
  assert.match(inbound, /inboundSmsChatDecision/);
  assert.equal(
    chatBodyWithoutSmsFooter("See you Thursday. Reply STOP to opt out."),
    "See you Thursday.",
  );
  assert.match(parentMessageSms("Little Fox"), /Reply STOP to opt out/);
  assert.match(daycareReplySms("Little Fox"), /Reply STOP to opt out/);
  assert.doesNotMatch(src("src/lib/server/family.ts"), /We tour Thursday/);
  assert.doesNotMatch(src("src/lib/server/family.ts"), /How can we help/);
  const thread = src("src/routes/inbox.$id.tsx");
  assert.match(thread, /viewerRole === "centre"/);
  assert.match(thread, /threadAdminRead/);
  assert.match(thread, /chatBodyWithoutSmsFooter/);
  assert.match(src("src/components/centre-inbox.tsx"), /chatBodyWithoutSmsFooter/);
  assert.match(src("src/components/centre-inbox.tsx"), /centre-thread-reply/);
  assert.match(src("docs/sms.md"), /1-877-502-7728/);
  assert.match(src("docs/sms.md"), /Opt-out management/);
});

test("status rows keep sid and status and drop the body", () => {
  const row = smsDeliveryRecord(
    { MessageSid: "SMabc", MessageStatus: "delivered", To: "+12045550199", Body: "secret note" },
    "stop",
  );
  assert.equal(row.messageSid, "SMabc");
  assert.equal(row.messageStatus, "delivered");
  assert.equal(row.keyword, "stop");
  assert.equal("body" in row, false);
});

test("sendSms brands the body and accepts TWILIO_PHONE_NUMBER", async () => {
  const calls = [];
  const result = await sendSms(
    { to: "+12045550199", body: "A parent wrote", consentGranted: true },
    {
      env: {
        FEATURE_SMS: "1",
        TWILIO_ACCOUNT_SID: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        TWILIO_AUTH_TOKEN: "test_auth_token_not_real",
        TWILIO_PHONE_NUMBER: "+18775027728",
      },
      fetchImpl: async (url, init) => {
        calls.push(String(init.body));
        return new Response(JSON.stringify({ sid: "SMbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", status: "queued" }), {
          status: 201,
        });
      },
    },
  );
  assert.equal(result.ok, true);
  assert.match(calls[0], /KidEase/);
  assert.match(calls[0], /From=%2B18775027728/);
  assert.doesNotMatch(calls[0], /test_auth_token_not_real/);
});

test("voice identities round-trip and TwiML never dials a number", () => {
  const id = voiceIdentityForUser("user_parent_1");
  assert.equal(userIdFromVoiceIdentity(id)?.userId, "user_parent_1");
  assert.equal(userIdFromVoiceIdentity(`client:${id}`)?.kind, "user");
  const admin = voiceIdentityForUser("user_admin", "admin");
  assert.equal(userIdFromVoiceIdentity(admin)?.kind, "admin");
  const dial = clientDialTwiml([id, "not a phone", "+12045550100"]);
  assert.match(dial, /<Client>/);
  assert.doesNotMatch(dial, /<Number/);
  assert.doesNotMatch(dial, /\+12045550100/);
  const inbound = incomingVoiceTwiml({
    identities: [id],
    recordingCallback: "https://www.kidease.ca/api/voice/recording",
  });
  assert.match(inbound, /KidEase/);
  assert.match(inbound, /<Record /);
  assert.doesNotMatch(inbound, /<Number/);
  assert.match(incomingVoiceTwiml({ identities: [], recordingCallback: "https://www.kidease.ca/api/voice/recording" }), /<Record /);
});

test("voice access token is scoped to the TwiML app and hides the secret", () => {
  const nowMs = 1_700_000_000_000;
  const identity = voiceIdentityForUser("user_parent_1");
  const result = createVoiceAccessToken({ identity }, { env: VOICE_ENV, nowMs });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const { payload } = decodeVoiceAccessTokenPayload(result.token);
  assert.equal(payload.grants.identity, identity);
  assert.equal(payload.grants.voice.outgoing.application_sid, VOICE_ENV.TWILIO_TWIML_APP_SID);
  assert.equal(payload.grants.voice.incoming.allow, true);
  assert.equal(payload.grants.video, undefined);
  assert.doesNotMatch(result.token, /api_key_secret_not_real/);
  assert.equal(voiceCredentialsPresent({}), false);
  assert.equal(voiceCredentialsPresent(VOICE_ENV), true);
});

test("voice and sms webhook routes are registered", () => {
  const tree = src("src/routeTree.gen.ts");
  const envExample = src(".env.example");
  for (const name of VOICE_ENV_NAMES) {
    assert.match(envExample, new RegExp(`${name}=`));
  }
  assert.match(src("src/routes/api/voice.incoming.ts"), /authorizeTwilioPost/);
  assert.match(src("src/routes/api/voice.connect.ts"), /clientDialTwiml/);
  assert.match(src("src/routes/api/voice.recording.ts"), /recordVoiceRecording/);
  assert.match(src("src/routes/api/sms.status.ts"), /upsertSmsDelivery/);
  assert.match(src("src/routes/api/sms.inbound.ts"), /inboundKeywordTwiml/);
  assert.match(src("src/lib/server/inbox.ts"), /notifyConsentedUserSms/);
  assert.match(src("src/routes/call.$conversationId.tsx"), /voiceCallLeadCentre/);
  assert.match(src("src/routes/call.$conversationId.tsx"), /voiceCallLeadParent/);
  assert.match(src("src/components/voice-call-panel.tsx"), /conversationId/);
  assert.doesNotMatch(src("src/components/voice-call-panel.tsx"), /tel:/);
  assert.match(tree, /id:\s*'\/api\/voice\/incoming'/);
  assert.match(tree, /id:\s*'\/api\/voice\/connect'/);
  assert.match(tree, /id:\s*'\/api\/voice\/recording'/);
  assert.match(tree, /id:\s*'\/call\/\$conversationId'/);
  assert.match(src("docs/voice.md"), /TWILIO_TWIML_APP_SID/);
  assert.match(src("docs/voice.md"), /api\/voice\/incoming/);
});
