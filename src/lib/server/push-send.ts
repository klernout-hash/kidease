/**
 * FCM HTTP v1 + APNs HTTP/2 sender.
 * Never called unless FEATURE_PUSH is on and the matching env names are set.
 * Secrets stay in env. Never log FCM_PRIVATE_KEY, APNS_KEY, or raw tokens.
 *
 * No @/ imports — scripts/push.test.mjs loads this file in Node.
 */

import { createPrivateKey, sign } from "node:crypto";
import { connect as http2Connect } from "node:http2";

type EnvMap = Record<string, string | undefined>;
type PushProvider = "fcm" | "apns";

const PUSH_SCAFFOLD_MESSAGE =
  "Push is scaffolded only. FEATURE_PUSH is off until Kyle adds Firebase and Apple credentials.";
const PUSH_CREDENTIALS_MESSAGE =
  "FCM / APNs credentials are not configured. Set the Firebase service account and/or the APNs .p8 env names. Do not invent keys.";

type Sql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

export type PushTokenTarget = {
  id: string;
  token: string;
  platform: "ios" | "android";
  provider: PushProvider;
};

export type PushSendOptions = {
  env?: EnvMap;
  fetchImpl?: typeof fetch;
  apnsRequest?: ApnsRequestImpl;
  sql?: Sql;
  nowSec?: number;
};

export type ApnsRequestImpl = (input: {
  host: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}) => Promise<{ status: number; body: string }>;

export type PushSendOk = {
  ok: true;
  sent: number;
  failed: number;
  skipped: number;
  tokenCount: number;
  invalidTokens: string[];
};

export type PushSendSkipped = {
  ok: false;
  skipped: true;
  error: string;
  dryRun?: true;
  tokenCount?: number;
};

export type PushFanoutResult = PushSendOk | PushSendSkipped;

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const FCM_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FCM_SEND_URL = (projectId: string) =>
  `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;

let cachedFcm: { email: string; token: string; exp: number } | null = null;

/** Test-only: drop the in-process FCM access-token cache. */
export function resetPushSendCacheForTests(): void {
  cachedFcm = null;
}

function envFlagOn(raw: string | undefined | null): boolean {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

function envStr(env: EnvMap, key: string) {
  return env[key]?.trim() || "";
}

function pushEnabled(env: EnvMap): boolean {
  return envFlagOn(env.FEATURE_PUSH);
}

function fcmConfigured(env: EnvMap): boolean {
  return Boolean(envStr(env, "FCM_PROJECT_ID") && envStr(env, "FCM_CLIENT_EMAIL") && envStr(env, "FCM_PRIVATE_KEY"));
}

function apnsConfigured(env: EnvMap): boolean {
  return Boolean(
    envStr(env, "APNS_KEY_ID") && envStr(env, "APNS_TEAM_ID") && envStr(env, "APNS_BUNDLE_ID") && envStr(env, "APNS_KEY"),
  );
}

/** Vercel pastes often store PEM with literal \n. Real newlines are left alone. */
export function pemFromEnv(raw: string): string {
  let v = String(raw || "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v.replace(/\\n/g, "\n");
}

function b64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function signJwt(
  header: Record<string, string>,
  payload: Record<string, string | number>,
  pem: string,
  alg: "RS256" | "ES256",
): string {
  const encoded = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = createPrivateKey(pemFromEnv(pem));
  const signature = sign("sha256", Buffer.from(encoded), {
    key,
    dsaEncoding: alg === "ES256" ? "ieee-p1363" : undefined,
  });
  return `${encoded}.${b64url(signature)}`;
}

export function sanitizePushText(raw: unknown, max: number): string {
  const cleaned = [...String(raw || "")]
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || code >= 32;
    })
    .join("");
  return cleaned.replace(/\s+/g, " ").trim().slice(0, max);
}

export function apnsHost(env: EnvMap = process.env): string {
  return envFlagOn(env.APNS_PRODUCTION) ? "api.push.apple.com" : "api.sandbox.push.apple.com";
}

function fcmErrorCode(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: { status?: string; details?: Array<{ errorCode?: string }> };
    };
    const detail = parsed.error?.details?.find((d) => d.errorCode)?.errorCode || "";
    return String(detail || parsed.error?.status || "").toUpperCase();
  } catch {
    return "";
  }
}

export function isInvalidVendorToken(input: { provider: PushProvider; status: number; body: string }): boolean {
  if (input.provider === "fcm") {
    const code = fcmErrorCode(input.body);
    return (
      code === "UNREGISTERED" ||
      code === "NOT_FOUND" ||
      input.status === 404 ||
      (input.status === 400 && code === "INVALID_ARGUMENT")
    );
  }
  if (input.status === 410) return true;
  const lower = input.body.toLowerCase();
  return input.status === 400 && /baddevicetoken|unregistered|devicetokennotfortopic/.test(lower);
}

async function defaultApnsRequest(input: {
  host: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const client = http2Connect(`https://${input.host}`);
    const done = (err?: Error, result?: { status: number; body: string }) => {
      try {
        client.close();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(result as { status: number; body: string });
    };
    client.on("error", (err) => done(err));
    const req = client.request({
      ":method": "POST",
      ":scheme": "https",
      ":path": input.path,
      ":authority": input.host,
      ...input.headers,
    });
    let status = 0;
    let data = "";
    req.on("response", (headers) => {
      status = Number(headers[":status"] || 0);
    });
    req.on("data", (chunk) => {
      data += String(chunk);
    });
    req.on("end", () => done(undefined, { status, body: data }));
    req.on("error", (err) => done(err));
    req.end(input.body);
  });
}

async function fcmAccessToken(env: EnvMap, fetchImpl: typeof fetch, nowSec: number): Promise<string> {
  const email = envStr(env, "FCM_CLIENT_EMAIL");
  if (cachedFcm && cachedFcm.email === email && cachedFcm.exp > nowSec + 60) {
    return cachedFcm.token;
  }
  const assertion = signJwt(
    { alg: "RS256", typ: "JWT" },
    {
      iss: email,
      scope: FCM_SCOPE,
      aud: FCM_TOKEN_URL,
      iat: nowSec,
      exp: nowSec + 3600,
    },
    envStr(env, "FCM_PRIVATE_KEY"),
    "RS256",
  );
  const res = await fetchImpl(FCM_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payload = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !payload.access_token) {
    throw new Error("FCM access token request failed.");
  }
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
  cachedFcm = { email, token: payload.access_token, exp: nowSec + expiresIn };
  return payload.access_token;
}

async function sendFcm(
  target: PushTokenTarget,
  title: string,
  body: string,
  env: EnvMap,
  fetchImpl: typeof fetch,
  nowSec: number,
): Promise<{ ok: boolean; invalid?: boolean; error?: string }> {
  const projectId = envStr(env, "FCM_PROJECT_ID");
  const access = await fcmAccessToken(env, fetchImpl, nowSec);
  const res = await fetchImpl(FCM_SEND_URL(projectId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token: target.token,
        notification: { title, body },
        android: { priority: "HIGH" },
      },
    }),
  });
  const text = await res.text();
  if (res.ok) return { ok: true };
  return {
    ok: false,
    invalid: isInvalidVendorToken({ provider: "fcm", status: res.status, body: text }),
    error: `FCM send failed (${res.status}).`,
  };
}

function apnsJwt(env: EnvMap, nowSec: number): string {
  return signJwt(
    { alg: "ES256", kid: envStr(env, "APNS_KEY_ID") },
    { iss: envStr(env, "APNS_TEAM_ID"), iat: nowSec },
    envStr(env, "APNS_KEY"),
    "ES256",
  );
}

async function sendApns(
  target: PushTokenTarget,
  title: string,
  body: string,
  env: EnvMap,
  apnsRequest: ApnsRequestImpl,
  nowSec: number,
): Promise<{ ok: boolean; invalid?: boolean; error?: string }> {
  const host = apnsHost(env);
  const topic = envStr(env, "APNS_BUNDLE_ID") || "ca.daycarenearme.app";
  const result = await apnsRequest({
    host,
    path: `/3/device/${target.token}`,
    headers: {
      authorization: `bearer ${apnsJwt(env, nowSec)}`,
      "apns-topic": topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      aps: {
        alert: { title, body },
        sound: "default",
      },
    }),
  });
  if (result.status >= 200 && result.status < 300) return { ok: true };
  return {
    ok: false,
    invalid: isInvalidVendorToken({ provider: "apns", status: result.status, body: result.body }),
    error: `APNs send failed (${result.status}).`,
  };
}

async function deleteInvalidTokens(sql: Sql | undefined, tokens: string[]): Promise<void> {
  if (!sql || tokens.length === 0) return;
  for (const token of tokens) {
    await sql.query(`delete from push_device_tokens where token = $1`, [token]).catch(() => undefined);
  }
}

/**
 * Fan-out one transactional notification to stored device tokens.
 * No-ops when FEATURE_PUSH is off or neither vendor is configured.
 */
export async function sendPushToDevices(
  input: { title: string; body: string; tokens: PushTokenTarget[] },
  options: PushSendOptions = {},
): Promise<PushFanoutResult> {
  const env = options.env ?? process.env;
  if (!pushEnabled(env)) {
    return { ok: false, skipped: true, error: PUSH_SCAFFOLD_MESSAGE };
  }
  const canFcm = fcmConfigured(env);
  const canApns = apnsConfigured(env);
  if (!canFcm && !canApns) {
    return { ok: false, skipped: true, error: PUSH_CREDENTIALS_MESSAGE };
  }

  const title = sanitizePushText(input.title, 80);
  const body = sanitizePushText(input.body, 160);
  if (!title || !body) {
    return { ok: false, skipped: true, error: "Push title and body are required." };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const apnsRequest = options.apnsRequest ?? defaultApnsRequest;
  const nowSec = options.nowSec ?? Math.floor(Date.now() / 1000);

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const invalidTokens: string[] = [];

  for (const target of input.tokens) {
    try {
      if (target.provider === "fcm") {
        if (!canFcm) {
          skipped += 1;
          continue;
        }
        const result = await sendFcm(target, title, body, env, fetchImpl, nowSec);
        if (result.ok) sent += 1;
        else {
          failed += 1;
          if (result.invalid) invalidTokens.push(target.token);
        }
        continue;
      }
      if (!canApns) {
        skipped += 1;
        continue;
      }
      const result = await sendApns(target, title, body, env, apnsRequest, nowSec);
      if (result.ok) sent += 1;
      else {
        failed += 1;
        if (result.invalid) invalidTokens.push(target.token);
      }
    } catch {
      failed += 1;
    }
  }

  await deleteInvalidTokens(options.sql, invalidTokens);
  console.info("[kidease-push]", {
    event: "send",
    sent,
    failed,
    skipped,
    tokenCount: input.tokens.length,
    invalid: invalidTokens.length,
  });
  return {
    ok: true,
    sent,
    failed,
    skipped,
    tokenCount: input.tokens.length,
    invalidTokens,
  };
}
