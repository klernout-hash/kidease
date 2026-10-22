import { PUSH_DISABLED_MESSAGE, PUSH_SCAFFOLD_MESSAGE, PUSH_WEB_BLOCKED_MESSAGE } from "@/lib/push";
import { isNative, nativePlatform } from "@/lib/native";
import { googleServicesHidden, readClientStoreChannel } from "@/lib/native-entitlements";

export type PushRegisterResult =
  | { ok: true; platform: "ios" | "android" }
  | { ok: false; reason: "disabled" | "no-plugin" | "denied" | "register-failed"; error: string };

let registrationListening = false;

/**
 * Native Capacitor registration. No-ops on www and when the caller has not
 * confirmed FEATURE_PUSH is on. Safe to call from NativeBoot.
 */
export async function registerPushDevice(opts?: { enabled?: boolean }): Promise<PushRegisterResult> {
  if (opts?.enabled !== true) {
    return { ok: false, reason: "disabled", error: PUSH_DISABLED_MESSAGE };
  }
  if (typeof window === "undefined" || !isNative()) {
    return { ok: false, reason: "disabled", error: PUSH_WEB_BLOCKED_MESSAGE };
  }
  // Huawei has no FCM. Do not call the Firebase plugin. HMS Push is a later slot.
  if (googleServicesHidden(readClientStoreChannel())) {
    return { ok: false, reason: "disabled", error: PUSH_DISABLED_MESSAGE };
  }

  const platform = nativePlatform();
  if (platform !== "ios" && platform !== "android") {
    return { ok: false, reason: "disabled", error: PUSH_WEB_BLOCKED_MESSAGE };
  }

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const current = await PushNotifications.checkPermissions();
    const receive =
      current.receive === "prompt" || current.receive === "prompt-with-rationale"
        ? (await PushNotifications.requestPermissions()).receive
        : current.receive;
    if (receive !== "granted") {
      return { ok: false, reason: "denied", error: "Notifications are off for KidEase." };
    }
    if (!registrationListening) {
      registrationListening = true;
      await PushNotifications.addListener("registration", (event) => {
        const token = String(event?.value || "").trim();
        if (!token) return;
        void import("@/lib/server/push-api").then(({ registerPushToken }) =>
          registerPushToken({
            data: {
              token,
              platform,
              provider: platform === "ios" ? "apns" : "fcm",
            },
          }),
        );
      });
    }
    await PushNotifications.register();
    return { ok: true, platform };
  } catch {
    // Plugin missing, or FCM / APNs is not in this binary yet.
    return { ok: false, reason: "no-plugin", error: PUSH_SCAFFOLD_MESSAGE };
  }
}
