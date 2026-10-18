/**
 * Twilio Voice access tokens for in-app calls.
 * Access Tokens need TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET.
 * Never log the API key secret. No @/ imports — scripts/comms.test.mjs loads this file.
 */

import { createHmac } from "node:crypto";
import { VOICE_CREDENTIALS_MESSAGE, VOICE_TOKEN_TTL_SECONDS } from "../voice.ts";

type EnvMap = Record<string, string | undefined>;

function envStr(env: EnvMap, key: string) {
  return env[key]?.trim() || "";
}

function base64Url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function nowSeconds(nowMs?: number) {
  return Math.floor((nowMs ?? Date.now()) / 1000);
}

export type CreateVoiceAccessTokenResult =
  | { ok: true; token: string; identity: string; ttlSeconds: number; expiresAt: number }
  | { ok: false; skipped: true; error: string }
  | { ok: false; skipped: false; error: string };

export function mintVoiceAccessTokenJwt(input: {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  twimlAppSid: string;
  identity: string;
  ttlSeconds?: number;
  nowMs?: number;
}): { token: string; ttlSeconds: number; expiresAt: number } {
  const ttlSeconds = Math.min(Math.max(input.ttlSeconds ?? VOICE_TOKEN_TTL_SECONDS, 60), 3600);
  const nbf = nowSeconds(input.nowMs);
  const exp = nbf + ttlSeconds;
  const header = { typ: "JWT", alg: "HS256", cty: "twilio-fpa;v=1" };
  const payload = {
    jti: `${input.apiKeySid}-${nbf}`,
    iss: input.apiKeySid,
    sub: input.accountSid,
    nbf,
    exp,
    grants: {
      identity: input.identity,
      voice: {
        incoming: { allow: true },
        outgoing: { application_sid: input.twimlAppSid },
      },
    },
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const sig = createHmac("sha256", input.apiKeySecret).update(signingInput).digest();
  return { token: `${signingInput}.${base64Url(sig)}`, ttlSeconds, expiresAt: exp };
}

export function decodeVoiceAccessTokenPayload(token: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
} {
  const [h, p] = token.split(".");
  const dec = (part: string) => {
    const pad = part.replace(/-/g, "+").replace(/_/g, "/");
    const buf = Buffer.from(pad + "===".slice((pad.length + 3) % 4), "base64");
    return JSON.parse(buf.toString("utf8")) as Record<string, unknown>;
  };
  return { header: dec(h), payload: dec(p) };
}

export function createVoiceAccessToken(
  input: { identity: string },
  options: { env?: EnvMap; nowMs?: number } = {},
): CreateVoiceAccessTokenResult {
  const env = options.env ?? process.env;
  const identity = String(input.identity || "")
    .trim()
    .slice(0, 121);
  if (!identity || !/^ke[ua]_[0-9a-f]+$/i.test(identity)) {
    return { ok: false, skipped: false, error: "Voice identity is not valid." };
  }
  const accountSid = envStr(env, "TWILIO_ACCOUNT_SID");
  const apiKeySid = envStr(env, "TWILIO_API_KEY_SID");
  const apiKeySecret = envStr(env, "TWILIO_API_KEY_SECRET");
  const twimlAppSid = envStr(env, "TWILIO_TWIML_APP_SID");
  if (!accountSid || !apiKeySid || !apiKeySecret || !twimlAppSid) {
    return { ok: false, skipped: true, error: VOICE_CREDENTIALS_MESSAGE };
  }
  const minted = mintVoiceAccessTokenJwt({
    accountSid,
    apiKeySid,
    apiKeySecret,
    twimlAppSid,
    identity,
    nowMs: options.nowMs,
  });
  return {
    ok: true,
    token: minted.token,
    identity,
    ttlSeconds: minted.ttlSeconds,
    expiresAt: minted.expiresAt,
  };
}
