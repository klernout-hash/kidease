/**
 * HMS alert-token read for the AppGallery build.
 * The token is not posted to KidEase and no message is sent.
 * A false flag returns before the plugin is imported.
 */

import { registerPlugin } from "@capacitor/core";
import { isNative } from "@/lib/native";
import { readClientStoreChannel } from "@/lib/native-entitlements";

type HmsPlugin = { register(): Promise<{ token?: string }> };

export async function registerHuaweiAlertPush(flagOn: boolean): Promise<boolean> {
  if (!flagOn || typeof window === "undefined" || !isNative()) return false;
  if (readClientStoreChannel() !== "huawei") return false;
  try {
    const hms = registerPlugin<HmsPlugin>("KidEaseHms");
    const token = String((await hms.register())?.token || "").trim();
    return token.length > 0;
  } catch {
    return false;
  }
}
