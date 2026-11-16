/**
 * Apple App Store platform features. Each flag defaults off.
 * Off means the helpers return empty plans and the shell does not call
 * ActivityKit, shortcut items, or the home-screen widget store.
 * Sign in with Apple, Universal Links, APNs, and SKStoreReviewController
 * already exist and are not gated by these flags.
 *
 * No @/ imports. scripts/apple-platform.test.mjs loads this file in Node.
 */

import { evaluateFeatureFlag, type EnvMap } from "../flags.ts";

export const APPLE_LIVE_ACTIVITIES_FLAG = "FEATURE_APPLE_LIVE_ACTIVITIES";
export const APPLE_SHORTCUTS_FLAG = "FEATURE_APPLE_APP_SHORTCUTS";
export const APPLE_HOME_WIDGET_FLAG = "FEATURE_APPLE_HOME_WIDGET";

export type AppleShortcut = {
  type: "ca.kidease.shortcut.search" | "ca.kidease.shortcut.parent" | "ca.kidease.shortcut.help";
  title: string;
  subtitle: string;
  path: "/search" | "/parent" | "/help";
};

export type AppleLiveActivityPlan = {
  childName: string;
  kind: "pickup" | "dropoff";
  timeLabel: string;
  centreName: string;
  title: string;
  body: string;
};

export type AppleWidgetSnapshot = {
  title: "KidEase";
  line: string;
  path: "/search";
};

export type ApplePlatformMarks = {
  appleLiveActivities?: true;
  appleShortcuts?: true;
  appleHomeWidget?: true;
};

const SHORTCUT_PATHS: Record<AppleShortcut["type"], AppleShortcut["path"]> = {
  "ca.kidease.shortcut.search": "/search",
  "ca.kidease.shortcut.parent": "/parent",
  "ca.kidease.shortcut.help": "/help",
};

function on(env: EnvMap | undefined, key: "FEATURE_APPLE_LIVE_ACTIVITIES" | "FEATURE_APPLE_APP_SHORTCUTS" | "FEATURE_APPLE_HOME_WIDGET"): boolean {
  return evaluateFeatureFlag(key, env);
}

/** True keys only. An all-off env adds nothing to the store-channel payload. */
export function applePlatformContext(env?: EnvMap): ApplePlatformMarks {
  const out: ApplePlatformMarks = {};
  if (on(env, APPLE_LIVE_ACTIVITIES_FLAG)) out.appleLiveActivities = true;
  if (on(env, APPLE_SHORTCUTS_FLAG)) out.appleShortcuts = true;
  if (on(env, APPLE_HOME_WIDGET_FLAG)) out.appleHomeWidget = true;
  return out;
}

export function appleShortcutPath(type: string | null | undefined): AppleShortcut["path"] | null {
  if (type === "ca.kidease.shortcut.search" || type === "ca.kidease.shortcut.parent" || type === "ca.kidease.shortcut.help") {
    return SHORTCUT_PATHS[type];
  }
  return null;
}

/** Home-screen quick actions. Empty unless FEATURE_APPLE_APP_SHORTCUTS is on. */
export function appleShortcutItems(flagOn: boolean, locale: "en" | "fr"): AppleShortcut[] {
  if (!flagOn) return [];
  const fr = locale === "fr";
  return [
    {
      type: "ca.kidease.shortcut.search",
      title: fr ? "Chercher une garderie" : "Search daycares",
      subtitle: fr ? "Garde permise au Canada" : "Licensed childcare in Canada",
      path: "/search",
    },
    {
      type: "ca.kidease.shortcut.parent",
      title: fr ? "Centres enregistrés" : "Saved centres",
      subtitle: fr ? "Votre liste" : "Your list",
      path: "/parent",
    },
    {
      type: "ca.kidease.shortcut.help",
      title: fr ? "Aide" : "Help",
      subtitle: fr ? "Écrire à KidEase" : "Write to KidEase",
      path: "/help",
    },
  ];
}

function cleanLabel(raw: string | null | undefined, max: number): string {
  return String(raw || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Lock-screen pickup or drop-off card. Null unless the flag is on and the
 * name and time are real. No health notes, fees, or ratings.
 */
export function appleLiveActivityPlan(
  flagOn: boolean,
  input: { childName?: string | null; kind?: string | null; timeLabel?: string | null; centreName?: string | null; locale?: "en" | "fr" },
): AppleLiveActivityPlan | null {
  if (!flagOn) return null;
  const childName = cleanLabel(input.childName, 40);
  const timeLabel = cleanLabel(input.timeLabel, 20);
  if (!childName || !timeLabel) return null;
  if (input.kind !== "pickup" && input.kind !== "dropoff") return null;
  const centreName = cleanLabel(input.centreName, 80);
  const fr = input.locale === "fr";
  const title =
    input.kind === "pickup"
      ? fr
        ? `Cueillette pour ${childName}`
        : `Pickup for ${childName}`
      : fr
        ? `Dépose pour ${childName}`
        : `Drop-off for ${childName}`;
  const body = centreName ? `${timeLabel} · ${centreName}` : timeLabel;
  return { childName, kind: input.kind, timeLabel, centreName, title, body };
}

/** Widget line. Null unless FEATURE_APPLE_HOME_WIDGET is on. No personal details. */
export function appleWidgetSnapshot(flagOn: boolean, locale: "en" | "fr"): AppleWidgetSnapshot | null {
  if (!flagOn) return null;
  return {
    title: "KidEase",
    line: locale === "fr" ? "Cherchez une garde permise au Canada." : "Search licensed childcare in Canada.",
    path: "/search",
  };
}
