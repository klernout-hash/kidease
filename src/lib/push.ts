/**
 * Push notification env names and client/server stubs.
 * Real Firebase / Apple credentials come later — do not invent keys.
 * Capacitor PushNotifications is wired on native only and gated by FEATURE_PUSH.
 *
 * No relative imports — scripts/push.test.mjs loads this file in Node.
 */

type EnvMap = Record<string, string | undefined>;

export const PUSH_ENV_NAMES = [
  "FEATURE_PUSH",
  "FCM_PROJECT_ID",
  "FCM_CLIENT_EMAIL",
  "FCM_PRIVATE_KEY",
  "APNS_KEY_ID",
  "APNS_TEAM_ID",
  "APNS_BUNDLE_ID",
  "APNS_KEY",
  "VITE_FCM_VAPID_PUBLIC_KEY",
] as const;

export const PUSH_SCAFFOLD_MESSAGE =
  "Push is scaffolded only. FEATURE_PUSH is off until Kyle adds Firebase and Apple credentials.";

export const PUSH_DISABLED_MESSAGE =
  "Push registration is off. FEATURE_PUSH is unset or 0 — www and production stay silent.";

export const PUSH_CREDENTIALS_MESSAGE =
  "FCM / APNs credentials are not configured. Set the Firebase service account and/or the APNs .p8 env names. Do not invent keys.";

export const PUSH_DRY_RUN_MESSAGE =
  "Dry-run only. No notification was sent. Live send is not wired.";

export const PUSH_WEB_BLOCKED_MESSAGE =
  "Push registration is native-only (iOS / Android). www does not collect tokens.";

export type PushPlatform = "ios" | "android";
export type PushProvider = "fcm" | "apns";

export type PushEnvPresence = {
  fcm: boolean;
  apns: boolean;
  vapid: boolean;
  credentialsPresent: boolean;
};

function envStr(env: EnvMap, key: string) {
  return env[key]?.trim() || "";
}

export function envFlagOn(raw: string | undefined | null): boolean {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

export function pushEnabled(env: EnvMap = process.env): boolean {
  return envFlagOn(env.FEATURE_PUSH);
}

export function fcmConfigured(env: EnvMap = process.env): boolean {
  return Boolean(envStr(env, "FCM_PROJECT_ID") && envStr(env, "FCM_CLIENT_EMAIL") && envStr(env, "FCM_PRIVATE_KEY"));
}

export function apnsConfigured(env: EnvMap = process.env): boolean {
  return Boolean(
    envStr(env, "APNS_KEY_ID") &&
      envStr(env, "APNS_TEAM_ID") &&
      envStr(env, "APNS_BUNDLE_ID") &&
      envStr(env, "APNS_KEY"),
  );
}

export function pushEnvPresence(env: EnvMap = process.env): PushEnvPresence {
  const fcm = fcmConfigured(env);
  const apns = apnsConfigured(env);
  const vapid = Boolean(envStr(env, "VITE_FCM_VAPID_PUBLIC_KEY"));
  return { fcm, apns, vapid, credentialsPresent: fcm || apns };
}

export function pushCredentialsPresent(env: EnvMap = process.env): boolean {
  return pushEnvPresence(env).credentialsPresent;
}

export function pushLive(env: EnvMap = process.env): boolean {
  return pushEnabled(env) && pushCredentialsPresent(env);
}

/** Device token: printable, no whitespace, 16–4096 chars. */
export function isPushToken(value: string): boolean {
  return /^[\x21-\x7E]{16,4096}$/.test(value);
}

export function normalizePushToken(raw: unknown): string {
  return String(raw || "").trim();
}

export function parsePushPlatform(raw: unknown): PushPlatform | null {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (v === "ios" || v === "android") return v;
  return null;
}

export function parsePushProvider(raw: unknown, platform?: PushPlatform | null): PushProvider | null {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (v === "fcm" || v === "apns") return v;
  if (!v && platform === "ios") return "apns";
  if (!v && platform === "android") return "fcm";
  return null;
}

export function normalizeDeviceId(raw: unknown): string {
  return String(raw || "")
    .trim()
    .slice(0, 120);
}

export function normalizePushLocale(raw: unknown): string {
  const v = String(raw || "")
    .trim()
    .toLowerCase()
    .slice(0, 12);
  return v === "fr" || v.startsWith("fr-") ? "fr" : v === "en" || v.startsWith("en-") ? "en" : "";
}

