/**
 * Background ring for in-app KidEase calls (voice + video).
 *
 * FEATURE_CALL_PUSH defaults off. With it off every entry point is a no-op.
 * Delivery per stored device token:
 *   - iOS        apns_voip  PushKit VoIP push (apns-push-type: voip) -> CallKit
 *   - Android    fcm        high-priority data message -> full-screen call notification
 *   - Amazon     adm        ADM data message (Fire tablets, no Google Play)
 *   - Huawei     hms        HMS Push Kit data message (urgency HIGH)
 *   - Web        web push   service-worker notification (reuses VAPID sender)
 * Cancel (answer / decline / caller hang-up / 25 s timeout) sends a
 * `call-cancel` message on the same channels so the ringing UI stops.
 *
 * Payloads carry only: type, ring id, conversation id, media, caller display
 * name. No phone numbers, emails, or tokens. Secrets stay in env and are
 * never logged. No @/ imports so scripts/call-ring.test.mjs can load it.
 */

import { createPrivateKey, sign } from "node:crypto";
import { connect as http2Connect } from "node:http2";

type EnvMap = Record<string, string | undefined>;

export const CALL_RING_TIMEOUT_SECONDS = 25;

export type CallMedia = "voice" | "video";
export type CallPushProvider = "apns_voip" | "fcm" | "hms" | "adm";

export type CallTokenTarget = { id: string; token: string; provider: CallPushProvider };

export type CallRingMessage = {
  type: "call" | "call-cancel";
  ringId: string;
  conversationId: string;
  media: CallMedia;
  callerName: string;
  reason?: "answered" | "declined" | "timeout" | "hangup";
};

export type Transport = {
  fetchImpl: typeof fetch;
  apnsRequest: (input: { host: string; path: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; body: string }>;
  nowSec: number;
};

export function callPushEnabled(env: EnvMap = process.env): boolean {
  const v = String(env.FEATURE_CALL_PUSH || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function callPushKeysStatus(env: EnvMap = process.env): Record<string, boolean> {
  return {
    apnsVoip: Boolean(env.APNS_KEY && env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_BUNDLE_ID),
    fcm: Boolean(env.FCM_PROJECT_ID && env.FCM_CLIENT_EMAIL && env.FCM_PRIVATE_KEY),
    hms: Boolean(env.HMS_APP_ID && env.HMS_CLIENT_ID && env.HMS_CLIENT_SECRET),
    adm: Boolean(env.ADM_CLIENT_ID && env.ADM_CLIENT_SECRET),
    webPush: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
  };
}

export function cleanCallerName(raw: unknown): string {
  const s = String(raw || "")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Never forward something that looks like a phone number or email as the caller label.
  if (/@/.test(s) || /\+?\d[\d\s().-]{6,}\d/.test(s)) return "KidEase";
  return s.slice(0, 60) || "KidEase";
}

export function callDataPayload(msg: CallRingMessage): Record<string, string> {
  const out: Record<string, string> = {
    type: msg.type,
    ringId: msg.ringId,
    conversationId: msg.conversationId,
    media: msg.media,
    callerName: cleanCallerName(msg.callerName),
    url: `/inbox?thread=${encodeURIComponent(msg.conversationId)}&call=${msg.media}`,
  };
  if (msg.reason) out.reason = msg.reason;
  return out;
}

function b64url(input: Buffer | string): string {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input)).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pem(raw: string): string {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

function jwt(header: Record<string, string>, payload: Record<string, string | number>, key: string, alg: "RS256" | "ES256"): string {
  const enc = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = sign("sha256", Buffer.from(enc), { key: createPrivateKey(pem(key)), dsaEncoding: alg === "ES256" ? "ieee-p1363" : undefined });
  return `${enc}.${b64url(sig)}`;
}

export function apnsVoipRequest(msg: CallRingMessage, token: string, env: EnvMap, nowSec: number) {
  const host = /^(1|true|on)$/i.test(String(env.APNS_PRODUCTION || "")) ? "api.push.apple.com" : "api.sandbox.push.apple.com";
  const auth = jwt({ alg: "ES256", kid: String(env.APNS_KEY_ID) }, { iss: String(env.APNS_TEAM_ID), iat: nowSec }, String(env.APNS_KEY), "ES256");
  return {
    host,
    path: `/3/device/${token}`,
    headers: {
      authorization: `bearer ${auth}`,
      "apns-push-type": "voip",
      "apns-topic": `${env.APNS_BUNDLE_ID}.voip`,
      "apns-priority": "10",
      "apns-expiration": String(nowSec + CALL_RING_TIMEOUT_SECONDS),
      "apns-collapse-id": msg.ringId.slice(0, 64),
    },
    body: JSON.stringify(callDataPayload(msg)),
  };
}

export function fcmCallBody(msg: CallRingMessage, token: string) {
  return {
    message: {
      token,
      data: callDataPayload(msg),
      android: { priority: "HIGH", ttl: `${CALL_RING_TIMEOUT_SECONDS}s`, collapse_key: msg.ringId },
    },
  };
}

export function hmsCallBody(msg: CallRingMessage, token: string) {
  return {
    validate_only: false,
    message: {
      data: JSON.stringify(callDataPayload(msg)),
      android: { urgency: "HIGH", ttl: `${CALL_RING_TIMEOUT_SECONDS}s`, collapse_key: -1, category: "VOIP" },
      token: [token],
    },
  };
}

let fcmAccess: { token: string; exp: number } | null = null;
let hmsAccess: { token: string; exp: number } | null = null;
let admAccess: { token: string; exp: number } | null = null;

export function admCallBody(msg: CallRingMessage) {
  return { data: callDataPayload(msg), expiresAfter: CALL_RING_TIMEOUT_SECONDS, consolidationKey: msg.ringId.slice(0, 64) };
}

async function admAccessToken(env: EnvMap, t: Transport): Promise<string> {
  if (admAccess && admAccess.exp > t.nowSec + 60) return admAccess.token;
  const res = await t.fetchImpl("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "messaging:push", client_id: String(env.ADM_CLIENT_ID), client_secret: String(env.ADM_CLIENT_SECRET) }).toString(),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error("adm_oauth_failed");
  admAccess = { token: j.access_token, exp: t.nowSec + (j.expires_in || 3600) };
  return j.access_token;
}

async function fcmAccessToken(env: EnvMap, t: Transport): Promise<string> {
  if (fcmAccess && fcmAccess.exp > t.nowSec + 60) return fcmAccess.token;
  const assertion = jwt(
    { alg: "RS256", typ: "JWT" },
    { iss: String(env.FCM_CLIENT_EMAIL), scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: t.nowSec, exp: t.nowSec + 3600 },
    String(env.FCM_PRIVATE_KEY),
    "RS256",
  );
  const res = await t.fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error("fcm_oauth_failed");
  fcmAccess = { token: j.access_token, exp: t.nowSec + (j.expires_in || 3600) };
  return j.access_token;
}

async function hmsAccessToken(env: EnvMap, t: Transport): Promise<string> {
  if (hmsAccess && hmsAccess.exp > t.nowSec + 60) return hmsAccess.token;
  const res = await t.fetchImpl("https://oauth-login.cloud.huawei.com/oauth2/v3/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: String(env.HMS_CLIENT_ID), client_secret: String(env.HMS_CLIENT_SECRET) }).toString(),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error("hms_oauth_failed");
  hmsAccess = { token: j.access_token, exp: t.nowSec + (j.expires_in || 3600) };
  return j.access_token;
}

export function resetCallRingCacheForTests(): void {
  fcmAccess = null;
  hmsAccess = null;
  admAccess = null;
}

export type CallFanout = { sent: number; failed: number; skipped: number; invalid: string[] };

/** Send one ring or cancel to every call-capable device of the callee. */
export async function fanoutCallMessage(msg: CallRingMessage, targets: CallTokenTarget[], env: EnvMap, t: Transport): Promise<CallFanout> {
  const out: CallFanout = { sent: 0, failed: 0, skipped: 0, invalid: [] };
  if (!callPushEnabled(env)) return { ...out, skipped: targets.length };
  const keys = callPushKeysStatus(env);
  for (const target of targets) {
    try {
      if (target.provider === "apns_voip") {
        if (!keys.apnsVoip) { out.skipped++; continue; }
        const r = await t.apnsRequest(apnsVoipRequest(msg, target.token, env, t.nowSec));
        if (r.status === 200) out.sent++;
        else { out.failed++; if (r.status === 410 || /BadDeviceToken|Unregistered/i.test(r.body)) out.invalid.push(target.id); }
      } else if (target.provider === "fcm") {
        if (!keys.fcm) { out.skipped++; continue; }
        const access = await fcmAccessToken(env, t);
        const r = await t.fetchImpl(`https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`, {
          method: "POST",
          headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
          body: JSON.stringify(fcmCallBody(msg, target.token)),
        });
        if (r.ok) out.sent++;
        else { out.failed++; if (r.status === 404) out.invalid.push(target.id); }
      } else if (target.provider === "hms") {
        if (!keys.hms) { out.skipped++; continue; }
        const access = await hmsAccessToken(env, t);
        const r = await t.fetchImpl(`https://push-api.cloud.huawei.com/v1/${env.HMS_APP_ID}/messages:send`, {
          method: "POST",
          headers: { authorization: `Bearer ${access}`, "content-type": "application/json;charset=utf-8" },
          body: JSON.stringify(hmsCallBody(msg, target.token)),
        });
        const j = (await r.json().catch(() => ({}))) as { code?: string };
        if (r.ok && j.code === "80000000") out.sent++;
        else { out.failed++; if (j.code === "80300007") out.invalid.push(target.id); }
      } else if (target.provider === "adm") {
        if (!keys.adm) { out.skipped++; continue; }
        const access = await admAccessToken(env, t);
        const r = await t.fetchImpl(`https://api.amazon.com/messaging/registrations/${encodeURIComponent(target.token)}/messages`, {
          method: "POST",
          headers: { authorization: `Bearer ${access}`, "content-type": "application/json", accept: "application/json", "x-amzn-type-version": "com.amazon.device.messaging.ADMMessage@1.0", "x-amzn-accept-type": "com.amazon.device.messaging.ADMSendResult@1.0" },
          body: JSON.stringify(admCallBody(msg)),
        });
        if (r.ok) out.sent++;
        else { out.failed++; if (r.status === 410) out.invalid.push(target.id); }
      } else out.skipped++;
    } catch {
      out.failed++;
    }
  }
  return out;
}

export const defaultTransport = (): Transport => ({
  fetchImpl: fetch,
  nowSec: Math.floor(Date.now() / 1000),
  apnsRequest: (input) =>
    new Promise((resolve, reject) => {
      const client = http2Connect(`https://${input.host}`);
      client.on("error", reject);
      const req = client.request({ ":method": "POST", ":path": input.path, ...input.headers });
      let status = 0;
      let body = "";
      req.on("response", (h) => { status = Number(h[":status"] || 0); });
      req.setEncoding("utf8");
      req.on("data", (c) => { body += c; });
      req.on("end", () => { client.close(); resolve({ status, body }); });
      req.on("error", (e) => { client.close(); reject(e); });
      req.end(input.body);
    }),
});
