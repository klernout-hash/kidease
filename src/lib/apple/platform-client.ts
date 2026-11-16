/**
 * Calls the iOS shell only when the matching Apple flag is already on.
 * A false flag returns before the plugin is imported.
 */

import { registerPlugin } from "@capacitor/core";
import { isNative } from "@/lib/native";
import { readClientStoreChannel } from "@/lib/native-entitlements";
import {
  appleLiveActivityPlan,
  appleShortcutItems,
  appleWidgetSnapshot,
  type AppleLiveActivityPlan,
} from "@/lib/apple/platform";

type ApplePlatformPlugin = {
  applyShortcuts(options: { items: { type: string; title: string; subtitle: string; path: string }[] }): Promise<void>;
  writeWidget(options: { title: string; line: string; path: string }): Promise<void>;
  startLiveActivity(options: AppleLiveActivityPlan): Promise<{ started: boolean }>;
  endLiveActivity(): Promise<void>;
};

const ApplePlatform = registerPlugin<ApplePlatformPlugin>("ApplePlatform");

function appleShell(): boolean {
  return typeof window !== "undefined" && isNative() && readClientStoreChannel() === "apple";
}

export async function applyAppleShortcuts(flagOn: boolean, locale: "en" | "fr"): Promise<boolean> {
  const items = appleShortcutItems(flagOn, locale);
  if (!items.length || !appleShell()) return false;
  try {
    await ApplePlatform.applyShortcuts({ items });
    return true;
  } catch {
    return false;
  }
}

export async function writeAppleHomeWidget(flagOn: boolean, locale: "en" | "fr"): Promise<boolean> {
  const snapshot = appleWidgetSnapshot(flagOn, locale);
  if (!snapshot || !appleShell()) return false;
  try {
    await ApplePlatform.writeWidget(snapshot);
    return true;
  } catch {
    return false;
  }
}

export async function startAppleLiveActivity(
  flagOn: boolean,
  input: { childName?: string | null; kind?: string | null; timeLabel?: string | null; centreName?: string | null; locale?: "en" | "fr" },
): Promise<boolean> {
  const plan = appleLiveActivityPlan(flagOn, input);
  if (!plan || !appleShell()) return false;
  try {
    const result = await ApplePlatform.startLiveActivity(plan);
    return result?.started === true;
  } catch {
    return false;
  }
}
