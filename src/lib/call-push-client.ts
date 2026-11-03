/**
 * Native background-ring registration (FEATURE_CALL_PUSH).
 * iOS: PushKit VoIP token from the CallKitVoip plugin -> provider apns_voip.
 * Android (Play): FCM token from @capacitor/push-notifications -> provider fcm, kind call.
 * Huawei: HMS token from the huawei build -> provider hms.
 * Answer / decline from CallKit or the notification routes into the in-app call.
 */

import { registerPlugin } from "@capacitor/core";
import { registerCallDevice, cancelCallRing } from "@/lib/server/call-ring-fns";

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
