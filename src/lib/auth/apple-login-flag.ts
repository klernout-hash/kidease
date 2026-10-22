/**
 * Sign in with Apple stays off until Kyle sets the four Apple keys and flips
 * FEATURE_APPLE_LOGIN. The Services ID and .p8 are not in this repo.
 * This file does not import node:crypto, so the login loader can use it.
 */

export const APPLE_LOGIN_FLAG = "FEATURE_APPLE_LOGIN";

type AppleLoginEnv = {
  APPLE_CLIENT_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  FEATURE_APPLE_LOGIN?: string;
};

function flagOn(raw: string | undefined | null): boolean {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

/** Button and Better Auth provider. Account deletion still revokes when the keys exist. */
export function appleLoginVisible(env: AppleLoginEnv = process.env): boolean {
  const creds = Boolean(
    env.APPLE_CLIENT_ID?.trim() &&
      env.APPLE_TEAM_ID?.trim() &&
      env.APPLE_KEY_ID?.trim() &&
      env.APPLE_PRIVATE_KEY?.trim(),
  );
  return creds && flagOn(env.FEATURE_APPLE_LOGIN);
}
