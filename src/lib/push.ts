/**
 * Push notification env names and client/server stubs.
 * Real Firebase / Apple credentials come later — do not invent keys.
 * Capacitor has no push plugin yet.
 */

import { envFlagOn, pushEnabled } from "./features";

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

function envStr(env: EnvMap, key: string) {
  return env[key]?.trim() || "";
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

export function pushCredentialsPresent(env: EnvMap = process.env): boolean {
  return fcmConfigured(env) || apnsConfigured(env);
}

export function pushLive(env: EnvMap = process.env): boolean {
  return pushEnabled(env) && pushCredentialsPresent(env);
}

export { envFlagOn, pushEnabled };
