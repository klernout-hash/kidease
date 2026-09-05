/**
 * Server-only Twilio Video room + Access Token mint.
 * Import from other server modules or via dynamic import in createServerFn
 * handlers (video-join.ts). Do not put this in a `*.server.*` file that
 * the client imports.
 *
 * Parent ↔ centre tour only. No recording. FEATURE_VIDEO defaults off.
 * Access Tokens require TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET (not
 * the Auth Token). Secrets stay in env. Never log the API key secret.
 *
 * No @/ or extensionless relative imports — scripts/video.test.mjs loads this file.
 * Flag helpers are duplicated from src/lib/video.ts so Node tests resolve.
 */

import { createHmac } from "node:crypto";

const VIDEO_SCAFFOLD_MESSAGE =
  "Video is scaffolded only. FEATURE_VIDEO is off until Kyle adds Twilio Video credentials.";

const VIDEO_CREDENTIALS_MESSAGE =
  "Twilio Video credentials are not configured. Set TWILIO_ACCOUNT_SID plus TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET (Access Tokens need an API key).";

const VIDEO_TOKEN_TTL_SECONDS = 900;

type EnvMap = Record<string, string | undefined>;

function flagOn(raw: string | undefined | null): boolean {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

function videoEnabled(env: EnvMap): boolean {
  return flagOn(env.FEATURE_VIDEO);
}

function envStr(env: EnvMap, key: string) {
  return env[key]?.trim() || "";
}

function envHas(env: EnvMap, key: string) {
  return Boolean(env[key]?.trim());
}

function videoCredentialsPresent(env: EnvMap): boolean {
  return envHas(env, "TWILIO_ACCOUNT_SID") && envHas(env, "TWILIO_API_KEY_SID") && envHas(env, "TWILIO_API_KEY_SECRET");
}

function base64Url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function nowSeconds(nowMs?: number) {
  return Math.floor((nowMs ?? Date.now()) / 1000);
}

export type CreateVideoAccessTokenInput = {
  identity: string;
  roomName: string;
  ttlSeconds?: number;
};

export type CreateVideoAccessTokenResult =
  | { ok: true; token: string; identity: string; roomName: string; ttlSeconds: number; expiresAt: number }
  | { ok: false; skipped: true; error: string }
  | { ok: false; skipped: false; error: string };

export type CreateVideoRoomInput = {
  roomName: string;
};

export type CreateVideoRoomResult =
  | {
      ok: true;
      roomName: string;
      roomSid: string;
      status: string;
      recording: false;
    }
  | { ok: false; skipped: true; error: string }
  | { ok: false; skipped: false; error: string };

export type VideoServerOptions = {
  env?: EnvMap;
  fetchImpl?: typeof fetch;
  nowMs?: number;
};

const TWILIO_ROOMS = "https://video.twilio.com/v1/Rooms";

function resolveApiKeyAuth(env: EnvMap): { username: string; password: string } | { error: string } {
  const apiKeySid = envStr(env, "TWILIO_API_KEY_SID");
  const apiKeySecret = envStr(env, "TWILIO_API_KEY_SECRET");
  if (apiKeySid && apiKeySecret) return { username: apiKeySid, password: apiKeySecret };
  const accountSid = envStr(env, "TWILIO_ACCOUNT_SID");
  const authToken = envStr(env, "TWILIO_AUTH_TOKEN");
  if (accountSid && authToken) return { username: accountSid, password: authToken };
  return { error: VIDEO_CREDENTIALS_MESSAGE };
}

/**
 * Twilio FPA Access Token (HS256) with a VideoGrant scoped to one room.
 * Matches the Node SDK shape: cty twilio-fpa;v=1, grants.identity + grants.video.room.
 */
export function mintVideoAccessTokenJwt(input: {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  identity: string;
  roomName: string;
  ttlSeconds?: number;
  nowMs?: number;
}): { token: string; ttlSeconds: number; expiresAt: number } {
  const ttlSeconds = Math.min(Math.max(input.ttlSeconds ?? VIDEO_TOKEN_TTL_SECONDS, 60), 3600);
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
      video: { room: input.roomName },
    },
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const sig = createHmac("sha256", input.apiKeySecret).update(signingInput).digest();
  return { token: `${signingInput}.${base64Url(sig)}`, ttlSeconds, expiresAt: exp };
}

export function decodeVideoAccessTokenPayload(token: string): {
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

/**
 * Mint a short-lived Video Access Token. No-ops when FEATURE_VIDEO is off
 * or API key env is missing. Never throws on skip. Never logs the secret.
 */
export function createVideoAccessToken(
  input: CreateVideoAccessTokenInput,
  options: VideoServerOptions = {},
): CreateVideoAccessTokenResult {
  const env = options.env ?? process.env;
  const identity = String(input.identity || "")
    .trim()
    .slice(0, 120);
  const roomName = String(input.roomName || "")
    .trim()
    .slice(0, 128);
  if (!identity) return { ok: false, skipped: false, error: "Video identity is required." };
  if (!roomName || !/^ke-[a-z]+-[a-zA-Z0-9_-]+$/.test(roomName)) {
    return { ok: false, skipped: false, error: "Video room name must be ke-{kind}-{id}." };
  }
  if (!videoEnabled(env)) {
    return { ok: false, skipped: true, error: VIDEO_SCAFFOLD_MESSAGE };
  }
  if (!videoCredentialsPresent(env)) {
    return { ok: false, skipped: true, error: VIDEO_CREDENTIALS_MESSAGE };
  }
  const accountSid = envStr(env, "TWILIO_ACCOUNT_SID");
  const apiKeySid = envStr(env, "TWILIO_API_KEY_SID");
  const apiKeySecret = envStr(env, "TWILIO_API_KEY_SECRET");
  const minted = mintVideoAccessTokenJwt({
    accountSid,
    apiKeySid,
    apiKeySecret,
    identity,
    roomName,
    ttlSeconds: input.ttlSeconds,
    nowMs: options.nowMs,
  });
  return {
    ok: true,
    token: minted.token,
    identity,
    roomName,
    ttlSeconds: minted.ttlSeconds,
    expiresAt: minted.expiresAt,
  };
}

async function fetchExistingRoom(
  fetchImpl: typeof fetch,
  authHeader: string,
  roomName: string,
): Promise<CreateVideoRoomResult | null> {
  let res: Response;
  try {
    res = await fetchImpl(`${TWILIO_ROOMS}/${encodeURIComponent(roomName)}`, {
      method: "GET",
      headers: { Authorization: authHeader },
    });
  } catch {
    return { ok: false, skipped: false, error: "Twilio Video room lookup failed." };
  }
  if (!res.ok) return null;
  let payload: { sid?: string; unique_name?: string; status?: string; record_participants_on_connect?: boolean } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    payload = {};
  }
  const sid = typeof payload.sid === "string" ? payload.sid : "";
  if (!sid) return null;
  return {
    ok: true,
    roomName: typeof payload.unique_name === "string" ? payload.unique_name : roomName,
    roomSid: sid,
    status: typeof payload.status === "string" ? payload.status : "in-progress",
    recording: false,
  };
}

/**
 * Find-or-create a group room. Recording is always off.
 * No-ops when FEATURE_VIDEO is off or credentials are missing.
 */
export async function createVideoRoom(
  input: CreateVideoRoomInput,
  options: VideoServerOptions = {},
): Promise<CreateVideoRoomResult> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const roomName = String(input.roomName || "")
    .trim()
    .slice(0, 128);
  if (!roomName || !/^ke-[a-z]+-[a-zA-Z0-9_-]+$/.test(roomName)) {
    return { ok: false, skipped: false, error: "Video room name must be ke-{kind}-{id}." };
  }
  if (!videoEnabled(env)) {
    return { ok: false, skipped: true, error: VIDEO_SCAFFOLD_MESSAGE };
  }
  if (!videoCredentialsPresent(env) && !envHas(env, "TWILIO_AUTH_TOKEN")) {
    return { ok: false, skipped: true, error: VIDEO_CREDENTIALS_MESSAGE };
  }
  if (!envHas(env, "TWILIO_ACCOUNT_SID")) {
    return { ok: false, skipped: true, error: VIDEO_CREDENTIALS_MESSAGE };
  }
  const auth = resolveApiKeyAuth(env);
  if ("error" in auth) return { ok: false, skipped: true, error: auth.error };

  let encoded: string;
  try {
    encoded = btoa(`${auth.username}:${auth.password}`);
  } catch {
    return { ok: false, skipped: false, error: "Twilio auth could not be encoded." };
  }
  const authHeader = `Basic ${encoded}`;

  const params = new URLSearchParams({
    UniqueName: roomName,
    Type: "group",
    RecordParticipantsOnConnect: "false",
    UnusedRoomTimeout: "10",
    EmptyRoomTimeout: "5",
    MaxParticipants: "6",
    MaxParticipantDuration: "3600",
  });
  const statusCallback = envStr(env, "TWILIO_VIDEO_STATUS_CALLBACK_URL");
  if (statusCallback) {
    params.set("StatusCallback", statusCallback);
    params.set("StatusCallbackMethod", "POST");
  }

  let res: Response;
  try {
    res = await fetchImpl(TWILIO_ROOMS, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
  } catch {
    return { ok: false, skipped: false, error: "Twilio Video room request failed." };
  }

  let payload: {
    sid?: string;
    unique_name?: string;
    status?: string;
    code?: number;
    message?: string;
    record_participants_on_connect?: boolean;
  } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    payload = {};
  }

  if (!res.ok) {
    const code = typeof payload.code === "number" ? payload.code : res.status;
    // 53113 = room exists with this unique name
    if (code === 53113 || res.status === 400) {
      const existing = await fetchExistingRoom(fetchImpl, authHeader, roomName);
      if (existing) return existing;
    }
    return { ok: false, skipped: false, error: `Twilio Video room failed (${code}).` };
  }

  const sid = typeof payload.sid === "string" ? payload.sid : "";
  if (!sid) return { ok: false, skipped: false, error: "Twilio Video room had no SID." };
  console.info("[kidease-video]", {
    ok: true,
    sid: sid ? `${sid.slice(0, 2)}…` : "RM…",
    status: payload.status || "in-progress",
    recording: false,
  });
  return {
    ok: true,
    roomName: typeof payload.unique_name === "string" ? payload.unique_name : roomName,
    roomSid: sid,
    status: typeof payload.status === "string" ? payload.status : "in-progress",
    recording: false,
  };
}
