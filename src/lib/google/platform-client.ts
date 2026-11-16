/**
 * Calls the Play shell only when the matching flag is already on.
 * A false flag returns before the plugin is imported.
 * The integrity token stays in the Play library. JS only hears ready or not.
 */

import { registerPlugin } from "@capacitor/core";
import { isNative } from "@/lib/native";
import { readClientStoreChannel } from "@/lib/native-entitlements";
import { playIntegrityNonce, playShortcutItems } from "@/lib/google/platform";

type PlayPlatformPlugin = {
  checkUpdate(options: { start: boolean }): Promise<{ available?: boolean }>;
  applyShortcuts(options: { items: { id: string; title: string; path: string }[] }): Promise<void>;
  requestIntegrity(options: { nonce: string }): Promise<{ ready?: boolean }>;
};

const PlayPlatform = registerPlugin<PlayPlatformPlugin>("PlayPlatform");

function playShell(): boolean {
  return typeof window !== "undefined" && isNative() && readClientStoreChannel() === "google";
}

export async function checkPlayUpdate(flagOn: boolean): Promise<boolean> {
  if (!flagOn || !playShell()) return false;
  try {
    const checked = await PlayPlatform.checkUpdate({ start: false });
    if (checked?.available !== true) return false;
    await PlayPlatform.checkUpdate({ start: true });
    return true;
  } catch {
    return false;
  }
}

export async function applyPlayShortcuts(flagOn: boolean, locale: "en" | "fr"): Promise<boolean> {
  const items = playShortcutItems(flagOn, locale);
  if (!items.length || !playShell()) return false;
  try {
    await PlayPlatform.applyShortcuts({ items });
    return true;
  } catch {
    return false;
  }
}

export async function requestPlayIntegrity(flagOn: boolean): Promise<boolean> {
  if (!flagOn || !playShell()) return false;
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const nonce = playIntegrityNonce(bytes);
  if (!nonce) return false;
  try {
    const result = await PlayPlatform.requestIntegrity({ nonce });
    return result?.ready === true;
  } catch {
    return false;
  }
}
