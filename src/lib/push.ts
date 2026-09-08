/**
 * Push notification env names and client/server stubs.
 * FCM HTTP v1 / APNs send is wired behind FEATURE_PUSH + env credentials.
 * Capacitor PushNotifications is native-only. Do not invent keys.
 *
 * Flag helpers come from ./flags.ts (extension required — scripts/push.test.mjs
 * loads this file in Node).
 */

import { envFlagOn, evaluateFeatureFlag, type EnvMap } from "./flags.ts";

export const PUSH_ENV_NAMES = [
  "FEATURE_PUSH",
  "FCM_PROJECT_ID",
  "FCM_CLIENT_EMAIL",
  "FCM_PRIVATE_KEY",
  "APNS_KEY_ID",
  "APNS_TEAM_ID",
  "APNS_BUNDLE_ID",
  "APNS_KEY",
  "APNS_PRODUCTION",
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

export const PUSH_FLAG_OFF_MESSAGE =
  "Coming soon — FEATURE_PUSH is off. Dry-run can count stored tokens. Nothing is sent to FCM or APNs.";

export type PushLabNextStep = {
  id: "credentials" | "native" | "flag";
  title: string;
  detail: string;
};

/** Next-build checklist. Does not enable send or invent credentials. */
export const FCM_LAB_NEXT_STEPS: readonly PushLabNextStep[] = [
  {
    id: "credentials",
    title: "FCM / APNs env names",
    detail:
      "Set FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY and/or APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_KEY on Vercel. Do not invent keys. Values stay server-only.",
  },
  {
    id: "native",
    title: "Native binary",
    detail:
      "Ship a TestFlight / Play build with @capacitor/push-notifications and the Push Notifications entitlement. www never registers tokens.",
  },
  {
    id: "flag",
    title: "FEATURE_PUSH stays off",
    detail:
      "Leave FEATURE_PUSH=0 until a dry-run token count on Admin → Chat lab looks right. Then enable in PostHog. Nothing is sent while the flag is off.",
  },
];

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

export { envFlagOn };

export function pushEnabled(env?: EnvMap): boolean {
  return evaluateFeatureFlag("FEATURE_PUSH", env);
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

