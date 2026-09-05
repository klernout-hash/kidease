import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { videoEnabled } from "../src/lib/features.ts";
import {
  parentPlusEntitlesVideo,
  parseVideoRoomParam,
  VIDEO_CREDENTIALS_MESSAGE,
  VIDEO_ENV_NAMES,
  VIDEO_MINUTES_NOT_ENFORCED_MESSAGE,
  VIDEO_MONTHLY_MINUTE_CAP,
  VIDEO_PLUS_BILLING_NOT_LIVE_MESSAGE,
  VIDEO_PLUS_REQUIRED_MESSAGE,
  VIDEO_SCAFFOLD_MESSAGE,
  VIDEO_SDK_WIRED,
  videoCredentialsPresent,
  videoEnvPresence,
  videoJoinGate,
  videoLive,
  videoMinutesStatus,
  videoRoomName,
} from "../src/lib/video.ts";
import {
  createVideoAccessToken,
  createVideoRoom,
  decodeVideoAccessTokenPayload,
  mintVideoAccessTokenJwt,
} from "../src/lib/server/video.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const LIVE_ENV = {
  FEATURE_VIDEO: "1",
  TWILIO_ACCOUNT_SID: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  TWILIO_API_KEY_SID: "SKbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  TWILIO_API_KEY_SECRET: "api_key_secret_not_real",
};

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("FEATURE_VIDEO defaults off", () => {
  assert.equal(videoEnabled({}), false);
  assert.equal(videoEnabled({ FEATURE_VIDEO: "0" }), false);
  assert.equal(videoEnabled({ FEATURE_VIDEO: "1" }), true);
  assert.equal(videoLive({}), false);
  assert.equal(videoLive(LIVE_ENV), true);
  assert.equal(VIDEO_SDK_WIRED, false);
});

test("createVideoAccessToken does not mint when FEATURE_VIDEO is off", () => {
  const result = createVideoAccessToken(
    { identity: "parent:user_1", roomName: "ke-thread-cv1" },
    { env: { ...LIVE_ENV, FEATURE_VIDEO: "0" } },
  );
  assert.deepEqual(result, { ok: false, skipped: true, error: VIDEO_SCAFFOLD_MESSAGE });
});

test("createVideoAccessToken does not mint when the API key is missing", () => {
  const result = createVideoAccessToken(
    { identity: "parent:user_1", roomName: "ke-thread-cv1" },
    { env: { FEATURE_VIDEO: "1", TWILIO_ACCOUNT_SID: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } },
  );
  assert.equal(result.ok, false);
  assert.equal(result.skipped, true);
  assert.equal(result.error, VIDEO_CREDENTIALS_MESSAGE);
});

test("Plus gate fails closed for a free parent", () => {
  const free = parentPlusEntitlesVideo({ role: "parent", plusPlan: "free", plusStatus: null }, true);
  assert.deepEqual(free, { ok: false, reason: "plus_required" });
  const gate = videoJoinGate({
    featureOn: true,
    credentialsPresent: true,
    stripeLive: true,
    actor: { role: "parent", plusPlan: "free", plusStatus: null },
  });
  assert.equal(gate.ok, false);
  if (!gate.ok) {
    assert.equal(gate.reason, "plus_required");
    assert.equal(gate.error, VIDEO_PLUS_REQUIRED_MESSAGE);
  }
});

test("Plus gate fails closed when billing is not live", () => {
  const rehearsal = parentPlusEntitlesVideo({ role: "parent", plusPlan: "plus", plusStatus: null }, false);
  assert.deepEqual(rehearsal, { ok: false, reason: "plus_required_billing_not_live" });
  const gate = videoJoinGate({
    featureOn: true,
    credentialsPresent: true,
    stripeLive: false,
    actor: { role: "parent", plusPlan: "plus", plusStatus: null },
  });
  assert.equal(gate.ok, false);
  if (!gate.ok) {
    assert.equal(gate.reason, "plus_required_billing_not_live");
    assert.equal(gate.error, VIDEO_PLUS_BILLING_NOT_LIVE_MESSAGE);
  }
});

test("Plus gate allows admin, provider, and live Plus parent", () => {
  assert.deepEqual(parentPlusEntitlesVideo({ role: "admin", plusPlan: "free" }, true), { ok: true });
  assert.deepEqual(parentPlusEntitlesVideo({ role: "provider", plusPlan: "free" }, true), { ok: true });
  assert.deepEqual(
    parentPlusEntitlesVideo({ role: "parent", plusPlan: "plus", plusStatus: "active" }, true),
    { ok: true },
  );
  assert.deepEqual(
    parentPlusEntitlesVideo({ role: "parent", plusPlan: "plus", plusStatus: "trialing" }, true),
    { ok: true },
  );
  assert.deepEqual(
    parentPlusEntitlesVideo({ role: "parent", plusPlan: "plus", plusStatus: "canceled" }, true),
    { ok: false, reason: "plus_required" },
  );
});

test("videoJoinGate fails closed when the flag is off even for Plus parents", () => {
  const gate = videoJoinGate({
    featureOn: false,
    credentialsPresent: true,
    stripeLive: true,
    actor: { role: "parent", plusPlan: "plus", plusStatus: "active" },
  });
  assert.deepEqual(gate, { ok: false, reason: "feature_off", error: VIDEO_SCAFFOLD_MESSAGE });
});

test("createVideoAccessToken mints a short VideoGrant JWT when the flag is on", () => {
  const nowMs = 1_700_000_000_000;
  const result = createVideoAccessToken(
    { identity: "parent:user_1", roomName: "ke-thread-cv99", ttlSeconds: 900 },
    { env: LIVE_ENV, nowMs },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const { header, payload } = decodeVideoAccessTokenPayload(result.token);
  assert.equal(header.alg, "HS256");
  assert.equal(header.cty, "twilio-fpa;v=1");
  assert.equal(payload.iss, LIVE_ENV.TWILIO_API_KEY_SID);
  assert.equal(payload.sub, LIVE_ENV.TWILIO_ACCOUNT_SID);
  assert.equal(payload.grants.identity, "parent:user_1");
  assert.deepEqual(payload.grants.video, { room: "ke-thread-cv99" });
  assert.equal(result.ttlSeconds, 900);
  assert.doesNotMatch(result.token, /api_key_secret_not_real/);
  const expected = mintVideoAccessTokenJwt({
    accountSid: LIVE_ENV.TWILIO_ACCOUNT_SID,
    apiKeySid: LIVE_ENV.TWILIO_API_KEY_SID,
    apiKeySecret: LIVE_ENV.TWILIO_API_KEY_SECRET,
    identity: "parent:user_1",
    roomName: "ke-thread-cv99",
    ttlSeconds: 900,
    nowMs,
  });
  assert.equal(result.token, expected.token);
});

test("createVideoRoom does not call Twilio when FEATURE_VIDEO is off", async () => {
  let called = 0;
  const result = await createVideoRoom(
    { roomName: "ke-thread-cv1" },
    {
      env: { ...LIVE_ENV, FEATURE_VIDEO: "0" },
      fetchImpl: async () => {
        called += 1;
        throw new Error("should not fetch");
      },
    },
  );
  assert.equal(called, 0);
  assert.deepEqual(result, { ok: false, skipped: true, error: VIDEO_SCAFFOLD_MESSAGE });
});

test("createVideoRoom posts a group room with recording off", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify({
        sid: "RMcccccccccccccccccccccccccccccccc",
        unique_name: "ke-booking-bk1",
        status: "in-progress",
        record_participants_on_connect: false,
      }),
      { status: 201 },
    );
  };
  const result = await createVideoRoom(
    { roomName: "ke-booking-bk1" },
    {
      env: {
        ...LIVE_ENV,
        TWILIO_VIDEO_STATUS_CALLBACK_URL: "https://www.kidease.ca/api/video/status",
      },
      fetchImpl,
    },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.recording, false);
  assert.equal(result.roomSid.startsWith("RM"), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://video.twilio.com/v1/Rooms");
  const body = String(calls[0].init.body);
  assert.match(body, /UniqueName=ke-booking-bk1/);
  assert.match(body, /Type=group/);
  assert.match(body, /RecordParticipantsOnConnect=false/);
  assert.match(body, /StatusCallback=/);
  assert.doesNotMatch(body, /api_key_secret_not_real/);
  assert.doesNotMatch(calls[0].init.headers.Authorization, /api_key_secret_not_real/);
});

test("room names are tied to booking, claim, or thread ids", () => {
  assert.equal(videoRoomName("thread", "cv_abc-1"), "ke-thread-cv_abc-1");
  assert.equal(videoRoomName("booking", "bk1"), "ke-booking-bk1");
  assert.equal(videoRoomName("claim", "cl1"), "ke-claim-cl1");
  assert.deepEqual(parseVideoRoomParam("cv99"), { kind: "thread", sourceId: "cv99" });
  assert.deepEqual(parseVideoRoomParam("ke-booking-bk1"), { kind: "booking", sourceId: "bk1" });
  assert.deepEqual(parseVideoRoomParam("lab"), { kind: "admin", sourceId: "lab" });
});

test("minute cap hook is honest and not enforced", () => {
  const status = videoMinutesStatus(12);
  assert.equal(status.enforced, false);
  assert.equal(status.cap, VIDEO_MONTHLY_MINUTE_CAP);
  assert.equal(status.used, 12);
  assert.equal(status.message, VIDEO_MINUTES_NOT_ENFORCED_MESSAGE);
});

test("env example lists Video names only and FEATURE_VIDEO is off", () => {
  const envExample = src(".env.example");
  const video = src("src/lib/video.ts");
  const send = src("src/lib/server/video.ts");
  for (const name of VIDEO_ENV_NAMES) {
    assert.match(envExample, new RegExp(`${name}=`));
    assert.match(video, new RegExp(name));
  }
  assert.match(envExample, /FEATURE_VIDEO=0/);
  const videoBlock = envExample.slice(envExample.indexOf("# Twilio Video"));
  assert.doesNotMatch(videoBlock, /TWILIO_AUTH_TOKEN=\S+/);
  assert.doesNotMatch(videoBlock, /TWILIO_API_KEY_SECRET=\S+/);
  assert.doesNotMatch(videoBlock, /sk_live_/);
  assert.doesNotMatch(videoBlock, /AC[0-9a-fA-F]{32}/);
  assert.match(video, /do not invent credentials/i);
  assert.match(send, /Never log the API key secret/);
  assert.doesNotMatch(send, /console\.\w+\([^)]*API_KEY_SECRET/);
  assert.equal(videoEnvPresence({}).credentialsPresent, false);
  assert.equal(videoCredentialsPresent(LIVE_ENV), true);
});

test("Bills, Stripe, and SMS paths do not import the Video module", () => {
  const billing = src("src/lib/server/billing.ts");
  const stripe = src("src/lib/server/stripe-checkout.ts");
  const webhook = src("src/routes/api/stripe.webhook.ts");
  const sms = src("src/lib/server/sms.ts");
  assert.doesNotMatch(billing, /@\/lib\/server\/video/);
  assert.doesNotMatch(stripe, /@\/lib\/server\/video/);
  assert.doesNotMatch(webhook, /@\/lib\/server\/video/);
  assert.doesNotMatch(sms, /@\/lib\/server\/video/);
});

test("video route is registered, Plus-gated, and not a *.server.* client import", () => {
  const route = src("src/routes/video.$roomId.tsx");
  const inbox = src("src/routes/inbox.$id.tsx");
  const tree = src("src/routeTree.gen.ts");
  const lab = src("src/lib/server/chat-scaffold.ts");
  const admin = src("src/routes/admin-chat.tsx");
  const join = src("src/lib/server/video-join.ts");
  assert.match(route, /createFileRoute\("\/video\/\$roomId"\)/);
  assert.match(route, /parentPlusSubscribe/);
  assert.match(route, /VIDEO_SDK_SCAFFOLD_MESSAGE/);
  assert.match(route, /from "@\/lib\/server\/video-join"/);
  assert.doesNotMatch(route, /\.server['"]/);
  assert.match(inbox, /to="\/video\/\$roomId"/);
  assert.match(tree, /from '\.\/routes\/video\.\$roomId'/);
  assert.match(tree, /id:\s*'\/video\/\$roomId'/);
  assert.match(lab, /videoEnabled/);
  assert.match(admin, /FEATURE_VIDEO/);
  assert.match(join, /await import\("\.\/video"\)/);
  assert.match(src("docs/video.md"), /Vercel env checklist/);
});
