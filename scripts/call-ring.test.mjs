import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  CALL_RING_TIMEOUT_SECONDS, apnsVoipRequest, callDataPayload, callPushEnabled, cleanCallerName,
  fanoutCallMessage, fcmCallBody, hmsCallBody, resetCallRingCacheForTests,
} from "../src/lib/server/call-ring.ts";

const msg = { type: "call", ringId: "ring_abc", conversationId: "cv_1", media: "video", callerName: "North Elm" };

test("flag defaults off and fanout skips everything", async () => {
  assert.equal(callPushEnabled({}), false);
  const r = await fanoutCallMessage(msg, [{ id: "t", token: "x".repeat(32), provider: "fcm" }], {}, {});
  assert.deepEqual(r, { sent: 0, failed: 0, skipped: 1, invalid: [] });
});

test("caller label never leaks a phone number or email", () => {
  assert.equal(cleanCallerName("+1 (204) 555-0101"), "KidEase");
  assert.equal(cleanCallerName("a@b.ca"), "KidEase");
  assert.equal(cleanCallerName("North Elm"), "North Elm");
  const p = callDataPayload({ ...msg, callerName: "204-555-0101" });
  assert.ok(!JSON.stringify(p).match(/555/));
});

test("FCM and HMS are high priority with a 25 s TTL", () => {
  assert.equal(CALL_RING_TIMEOUT_SECONDS, 25);
  const f = fcmCallBody(msg, "tok");
  assert.equal(f.message.android.priority, "HIGH");
  assert.equal(f.message.android.ttl, "25s");
  assert.equal(f.message.data.type, "call");
  const h = hmsCallBody(msg, "tok");
  assert.equal(h.message.android.urgency, "HIGH");
  assert.equal(JSON.parse(h.message.data).ringId, "ring_abc");
});

test("APNs VoIP push uses voip type, .voip topic, 25 s expiry", async () => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const env = { FEATURE_CALL_PUSH: "1", APNS_KEY: privateKey.export({ type: "pkcs8", format: "pem" }), APNS_KEY_ID: "K", APNS_TEAM_ID: "T", APNS_BUNDLE_ID: "ca.kidease.app" };
  const req = apnsVoipRequest(msg, "devtok", env, 1000);
  assert.equal(req.headers["apns-push-type"], "voip");
  assert.equal(req.headers["apns-topic"], "ca.kidease.app.voip");
  assert.equal(req.headers["apns-expiration"], "1025");
  resetCallRingCacheForTests();
  const seen = [];
  const r = await fanoutCallMessage({ ...msg, type: "call-cancel", reason: "answered" }, [{ id: "a", token: "d".repeat(64), provider: "apns_voip" }, { id: "b", token: "h".repeat(64), provider: "hms" }], env, {
    nowSec: 1000, fetchImpl: async () => { throw new Error("no"); },
    apnsRequest: async (i) => { seen.push(JSON.parse(i.body)); return { status: 200, body: "" }; },
  });
  assert.equal(r.sent, 1);
  assert.equal(r.skipped, 1);
  assert.equal(seen[0].type, "call-cancel");
  assert.equal(seen[0].reason, "answered");
});
