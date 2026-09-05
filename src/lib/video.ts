/**
 * Twilio Video env names, Parent Plus gate, and room-name helpers.
 * Real Account SID / API key come later — do not invent credentials.
 *
 * Video is a Parent Plus offer ($7.99/mo or $59/yr): parent ↔ centre tour.
 * Providers join without paying. Parents need active Plus (or admin testing).
 * No recording in v1. Monthly minute caps are scaffolded, not enforced.
 *
 * No relative imports — scripts/video.test.mjs loads this file in Node.
 */

type EnvMap = Record<string, string | undefined>;

export const VIDEO_ENV_NAMES = [
  "FEATURE_VIDEO",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_API_KEY_SID",
  "TWILIO_API_KEY_SECRET",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_VIDEO_STATUS_CALLBACK_URL",
] as const;

export const VIDEO_SCAFFOLD_MESSAGE =
  "Video is scaffolded only. FEATURE_VIDEO is off until Kyle adds Twilio Video credentials.";

export const VIDEO_CREDENTIALS_MESSAGE =
  "Twilio Video credentials are not configured. Set TWILIO_ACCOUNT_SID plus TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET (Access Tokens need an API key).";

export const VIDEO_SDK_SCAFFOLD_MESSAGE =
  "Scaffold — connect Twilio Video SDK next. Room and access token were created server-side. This page does not attach the camera yet.";

export const VIDEO_PLUS_REQUIRED_MESSAGE =
  "Parent Plus is required for video tours ($7.99/mo or $59/yr).";

export const VIDEO_PLUS_BILLING_NOT_LIVE_MESSAGE =
  "Plus required (billing not live). Video stays off for free parents until Stripe live keys and an active Plus subscription.";

export const VIDEO_NO_RECORDING_MESSAGE = "This version does not record calls.";

export const VIDEO_MINUTES_NOT_ENFORCED_MESSAGE = "Monthly minute limits are not enforced yet.";

/** Planned monthly cap. Hook only — do not block joins on this number. */
export const VIDEO_MONTHLY_MINUTE_CAP = 60;

/** Access Token TTL in seconds. Short on purpose (Twilio max is 24h). */
export const VIDEO_TOKEN_TTL_SECONDS = 900;

export const VIDEO_SDK_WIRED = false;

export type VideoSourceKind = "thread" | "booking" | "claim" | "admin";

export type VideoEnvPresence = {
  accountSid: boolean;
  apiKey: boolean;
  authToken: boolean;
  statusCallback: boolean;
  credentialsPresent: boolean;
};

export type VideoActor = {
  role: string | null | undefined;
  plusPlan?: string | null;
  plusStatus?: string | null;
};

export type VideoPlusGate =
  | { ok: true }
  | { ok: false; reason: "plus_required" | "plus_required_billing_not_live" };

export type VideoJoinGateReason =
  | "feature_off"
  | "no_credentials"
  | "plus_required"
  | "plus_required_billing_not_live";

export type VideoJoinGate =
  | { ok: true }
  | { ok: false; reason: VideoJoinGateReason; error: string };

export type VideoMinutesStatus = {
  used: number;
  cap: number;
  remaining: number;
  enforced: false;
  message: string;
};

function envStr(env: EnvMap, key: string) {
  return env[key]?.trim() || "";
}

function flagOn(raw: string | undefined | null): boolean {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function videoEnabled(env: EnvMap = process.env): boolean {
  return flagOn(env.FEATURE_VIDEO);
}

export function videoEnvPresence(env: EnvMap = process.env): VideoEnvPresence {
  const accountSid = Boolean(envStr(env, "TWILIO_ACCOUNT_SID"));
  const apiKey = Boolean(envStr(env, "TWILIO_API_KEY_SID") && envStr(env, "TWILIO_API_KEY_SECRET"));
  const authToken = Boolean(envStr(env, "TWILIO_AUTH_TOKEN"));
  const statusCallback = Boolean(envStr(env, "TWILIO_VIDEO_STATUS_CALLBACK_URL"));
  return {
    accountSid,
    apiKey,
    authToken,
    statusCallback,
    credentialsPresent: accountSid && apiKey,
  };
}

export function videoCredentialsPresent(env: EnvMap = process.env): boolean {
  return videoEnvPresence(env).credentialsPresent;
}

export function videoLive(env: EnvMap = process.env): boolean {
  return videoEnabled(env) && videoCredentialsPresent(env);
}

export function sanitizeVideoSourceId(raw: string | null | undefined): string {
  return String(raw || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
}

export function videoRoomName(kind: VideoSourceKind, sourceId: string): string {
  const id = sanitizeVideoSourceId(sourceId);
  if (!id) return "";
  return `ke-${kind}-${id}`;
}

export function parseVideoRoomParam(raw: string | null | undefined): { kind: VideoSourceKind; sourceId: string } {
  const v = String(raw || "").trim();
  if (!v || v === "lab") return { kind: "admin", sourceId: "lab" };
  const prefixed = /^ke-(thread|booking|claim|admin)-([a-zA-Z0-9_-]+)$/.exec(v);
  if (prefixed) return { kind: prefixed[1] as VideoSourceKind, sourceId: prefixed[2] };
  const kindPrefix = /^(thread|booking|claim|admin)[-_/]([a-zA-Z0-9_-]+)$/.exec(v);
  if (kindPrefix) return { kind: kindPrefix[1] as VideoSourceKind, sourceId: kindPrefix[2] };
  return { kind: "thread", sourceId: sanitizeVideoSourceId(v) };
}

/**
 * Parent Plus entitlement for video.
 * Providers join without paying. Admins may test.
 * When Stripe is live: parent needs plus_plan=plus and plus_status active/trialing.
 * When Stripe is not live: fail closed for parents (honest billing-not-live).
 */
export function parentPlusEntitlesVideo(actor: VideoActor, stripeLive: boolean): VideoPlusGate {
  const role = String(actor.role || "")
    .trim()
    .toLowerCase();
  if (role === "admin") return { ok: true };
  if (role === "provider") return { ok: true };
  if (stripeLive) {
    const plan = String(actor.plusPlan || "")
      .trim()
      .toLowerCase();
    const status = String(actor.plusStatus || "")
      .trim()
      .toLowerCase();
    if (plan === "plus" && (status === "active" || status === "trialing")) return { ok: true };
    return { ok: false, reason: "plus_required" };
  }
  return { ok: false, reason: "plus_required_billing_not_live" };
}

export function videoJoinGate(input: {
  featureOn: boolean;
  credentialsPresent: boolean;
  actor: VideoActor;
  stripeLive: boolean;
}): VideoJoinGate {
  if (!input.featureOn) return { ok: false, reason: "feature_off", error: VIDEO_SCAFFOLD_MESSAGE };
  if (!input.credentialsPresent) return { ok: false, reason: "no_credentials", error: VIDEO_CREDENTIALS_MESSAGE };
  const plus = parentPlusEntitlesVideo(input.actor, input.stripeLive);
  if (!plus.ok) {
    return {
      ok: false,
      reason: plus.reason,
      error: plus.reason === "plus_required_billing_not_live" ? VIDEO_PLUS_BILLING_NOT_LIVE_MESSAGE : VIDEO_PLUS_REQUIRED_MESSAGE,
    };
  }
  return { ok: true };
}

/** Honest hook for a later monthly minute cap. Never blocks a join today. */
export function videoMinutesStatus(usedThisMonth = 0): VideoMinutesStatus {
  const used = Math.max(0, Number(usedThisMonth) || 0);
  return {
    used,
    cap: VIDEO_MONTHLY_MINUTE_CAP,
    remaining: Math.max(0, VIDEO_MONTHLY_MINUTE_CAP - used),
    enforced: false,
    message: VIDEO_MINUTES_NOT_ENFORCED_MESSAGE,
  };
}

export function plusGateCopy(reason: VideoJoinGateReason | null | undefined): string {
  if (reason === "plus_required_billing_not_live") return VIDEO_PLUS_BILLING_NOT_LIVE_MESSAGE;
  if (reason === "plus_required") return VIDEO_PLUS_REQUIRED_MESSAGE;
  if (reason === "no_credentials") return VIDEO_CREDENTIALS_MESSAGE;
  if (reason === "feature_off") return VIDEO_SCAFFOLD_MESSAGE;
  return "";
}
