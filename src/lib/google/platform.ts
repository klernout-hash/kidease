/**
 * Google Play platform features. Each flag defaults off.
 * Off means no update check, no shortcuts, and no Play Integrity request.
 * FCM, App Links, and Play in-app review already exist and are not gated here.
 *
 * No @/ imports. scripts/google-platform.test.mjs loads this file in Node.
 */

import { evaluateFeatureFlag, type EnvMap } from "../flags.ts";

export const PLAY_UPDATES_FLAG = "FEATURE_PLAY_IN_APP_UPDATES";
export const PLAY_SHORTCUTS_FLAG = "FEATURE_PLAY_APP_SHORTCUTS";
export const PLAY_INTEGRITY_FLAG = "FEATURE_PLAY_INTEGRITY";

export type PlayShortcut = {
  id: "search" | "parent" | "help";
  title: string;
  path: "/search" | "/parent" | "/help";
};

export type PlayPlatformMarks = {
  playUpdates?: true;
  playShortcuts?: true;
  playIntegrity?: true;
};

function on(env: EnvMap | undefined, key: "FEATURE_PLAY_IN_APP_UPDATES" | "FEATURE_PLAY_APP_SHORTCUTS" | "FEATURE_PLAY_INTEGRITY"): boolean {
  return evaluateFeatureFlag(key, env);
}

/** True keys only. An all-off env adds nothing to the store-channel payload. */
export function playPlatformContext(env?: EnvMap): PlayPlatformMarks {
  const out: PlayPlatformMarks = {};
  if (on(env, PLAY_UPDATES_FLAG)) out.playUpdates = true;
  if (on(env, PLAY_SHORTCUTS_FLAG)) out.playShortcuts = true;
  if (on(env, PLAY_INTEGRITY_FLAG)) out.playIntegrity = true;
  return out;
}

export function playShortcutItems(flagOn: boolean, locale: "en" | "fr"): PlayShortcut[] {
  if (!flagOn) return [];
  const fr = locale === "fr";
  return [
    { id: "search", title: fr ? "Chercher une garderie" : "Search daycares", path: "/search" },
    { id: "parent", title: fr ? "Centres enregistrés" : "Saved centres", path: "/parent" },
    { id: "help", title: fr ? "Aide" : "Help", path: "/help" },
  ];
}

/** URL-safe nonce. Null when the bytes are too short. The token itself is never returned. */
export function playIntegrityNonce(bytes: Uint8Array): string | null {
  if (bytes.length < 16 || bytes.length > 64) return null;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}
