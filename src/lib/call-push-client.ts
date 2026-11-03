/**
 * Native background-ring registration (FEATURE_CALL_PUSH).
 * iOS: PushKit VoIP token from the CallKitVoip plugin -> provider apns_voip.
 * Android (Play): FCM token from @capacitor/push-notifications -> provider fcm, kind call.
 * Huawei: HMS token from the huawei build -> provider hms.
 * Answer / decline from CallKit or the notification routes into the in-app call.
 */

import { registerPlugin } from "@capacitor/core";
import { registerCallDevice, cancelCallRing } from "@/lib/server/call-ring-fns";
import { readClientStoreChannel } from "@/lib/native-entitlements";

type CallKitVoip = {
  register(): Promise<void>;
  endCall(o: { ringId: string }): Promise<void>;
  addListener(event: "voipToken", cb: (e: { token: string }) => void): Promise<{ remove(): void }>;
  addListener(
    event: "callAnswered" | "callDeclined" | "callTimeout",
    cb: (e: Record<string, string>) => void,
  ): Promise<{ remove(): void }>;
};

const CallKit = registerPlugin<CallKitVoip>("CallKitVoip");

type KidEaseHmsPlugin = { register(): Promise<{ token?: string }> };

/**
 * HMS token from the huawei flavor only. Posts to push_device_tokens as
 * provider "hms". The server drops it while FEATURE_CALL_PUSH is off.
 * Other builds never call this plugin.
 */
export async function registerHuaweiCallToken(): Promise<void> {
  if (readClientStoreChannel() !== "huawei") return;
  try {
    const hms = registerPlugin<KidEaseHmsPlugin>("KidEaseHms");
    const token = String((await hms.register())?.token || "").trim();
    if (!token) return;
    await registerCallDevice({ data: { token, provider: "hms", platform: "huawei" } }).catch(() => null);
  } catch {
    // Plugin missing, or AppGallery Push Kit is not configured in this binary yet.
  }
}

export async function registerBackgroundRing(platform: "ios" | "android", fcmToken?: string): Promise<void> {
  if (platform === "android") {
    if (fcmToken) await registerCallDevice({ data: { token: fcmToken, provider: "fcm", platform: "android" } }).catch(() => null);
    return;
  }
  await CallKit.addListener("voipToken", ({ token }) => {
    void registerCallDevice({ data: { token, provider: "apns_voip", platform: "ios" } }).catch(() => null);
  });
  await CallKit.addListener("callAnswered", (d) => {
    if (d.ringId) void cancelCallRing({ data: { ringId: d.ringId, reason: "answered" } }).catch(() => null);
    if (d.url && d.url.startsWith("/")) window.location.assign(d.url);
  });
  await CallKit.addListener("callDeclined", (d) => {
    if (d.ringId) void cancelCallRing({ data: { ringId: d.ringId, reason: "declined" } }).catch(() => null);
  });
  await CallKit.register();
}
