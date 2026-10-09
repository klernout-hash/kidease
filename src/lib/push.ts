/**
 * Push notification env names and client/server stubs.
 * FCM HTTP v1 / APNs send is wired behind FEATURE_PUSH + env credentials.
 * Capacitor PushNotifications is native-only. Do not invent keys.
 *
 * Flag helpers come from ./flags.ts (extension required: scripts/push.test.mjs
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
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
  "VITE_FCM_VAPID_PUBLIC_KEY",
] as const;

export const PUSH_SCAFFOLD_MESSAGE =
  "Push is scaffolded only. FEATURE_PUSH is off until Kyle adds Firebase and Apple credentials.";

export const PUSH_DISABLED_MESSAGE =
  "Push registration is off. FEATURE_PUSH is unset or 0: www and production stay silent.";

export const PUSH_CREDENTIALS_MESSAGE =
  "FCM / APNs credentials are not configured. Set the Firebase service account and/or the APNs .p8 env names. Do not invent keys.";

export const PUSH_DRY_RUN_MESSAGE =
  "Dry-run only. No notification was sent. Live send is not wired.";

export const PUSH_WEB_BLOCKED_MESSAGE =
  "Push registration is native-only (iOS / Android). www does not collect tokens.";

export const PUSH_FLAG_OFF_MESSAGE =
  "Coming soon: FEATURE_PUSH is off. Dry-run can count stored tokens. Nothing is sent to FCM or APNs.";

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
      "Set FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY and/or APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_KEY for phones. For the website set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and the same public key as VITE_FCM_VAPID_PUBLIC_KEY. Do not invent keys. Values stay server-only.",
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
      "Leave FEATURE_PUSH=0 on Production until Chat lab shows a real secret (FCM, APNs, or the VAPID pair) and a dry-run looks right. Preview may set 1. Then enable in PostHog. Nothing is sent while the flag is off.",
  },
];

export type PushPlatform = "ios" | "android";
export type PushProvider = "fcm" | "apns";

export type PushEnvPresence = {
  fcm: boolean;
  apns: boolean;
  /** Public VAPID key is set (VAPID_PUBLIC_KEY or VITE_FCM_VAPID_PUBLIC_KEY). Value is never included. */
  vapid: boolean;
  /** Server-only VAPID private key is set. Value is never included. */
  vapidPrivate: boolean;
  /** Both VAPID keys are set, so website delivery can run when FEATURE_PUSH is armed. */
  webPush: boolean;
  /** Native FCM or APNs. Does not include VAPID. */
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

/** Public key the browser subscribed with. Server send accepts either env name. */
export function vapidPublicKey(env: EnvMap = process.env): string {
  return envStr(env, "VAPID_PUBLIC_KEY") || envStr(env, "VITE_FCM_VAPID_PUBLIC_KEY");
}

/** Server-only. Never prefix VITE_. */
export function vapidPrivateKey(env: EnvMap = process.env): string {
  return envStr(env, "VAPID_PRIVATE_KEY");
}

export function vapidSubject(env: EnvMap = process.env): string {
  const raw = envStr(env, "VAPID_SUBJECT");
  if (raw.startsWith("mailto:") || raw.startsWith("https://")) return raw.slice(0, 200);
  return "mailto:support@kidease.ca";
}

export function webPushCredentialsPresent(env: EnvMap = process.env): boolean {
  return Boolean(vapidPublicKey(env) && vapidPrivateKey(env));
}

export function pushEnvPresence(env: EnvMap = process.env): PushEnvPresence {
  const fcm = fcmConfigured(env);
  const apns = apnsConfigured(env);
  const vapid = Boolean(vapidPublicKey(env));
  const vapidPrivate = Boolean(vapidPrivateKey(env));
  const webPush = vapid && vapidPrivate;
  return { fcm, apns, vapid, vapidPrivate, webPush, credentialsPresent: fcm || apns };
}

export function pushCredentialsPresent(env: EnvMap = process.env): boolean {
  return pushEnvPresence(env).credentialsPresent;
}

/**
 * Production may arm FEATURE_PUSH when any real push secret exists.
 * Native send still requires FCM or APNs. Website send still requires the VAPID pair.
 */
export function pushChannelSecretsPresent(env: EnvMap = process.env): boolean {
  const presence = pushEnvPresence(env);
  return presence.credentialsPresent || presence.webPush;
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

