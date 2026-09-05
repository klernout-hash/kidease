import { PUSH_DISABLED_MESSAGE, PUSH_SCAFFOLD_MESSAGE, PUSH_WEB_BLOCKED_MESSAGE } from "@/lib/push";
import { isNative, nativePlatform } from "@/lib/native";

export type PushRegisterResult =
  | { ok: true; platform: "ios" | "android" }
  | { ok: false; reason: "disabled" | "no-plugin" | "denied" | "register-failed"; error: string };

let sessionStarted = false;

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

  const platform = nativePlatform();
  if (platform !== "ios" && platform !== "android") {
    return { ok: false, reason: "disabled", error: PUSH_WEB_BLOCKED_MESSAGE };
  }

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") {
      return { ok: false, reason: "denied", error: "Notification permission was not granted." };
    }

    if (!sessionStarted) {
      sessionStarted = true;
      await PushNotifications.addListener("registration", (event) => {
        void import("@/lib/server/push-api")
          .then(({ registerPushToken }) =>
            registerPushToken({
              data: {
                token: event.value,
                platform,
                provider: platform === "ios" ? "apns" : "fcm",
              },
            }),
          )
          .catch(() => undefined);
      });
      await PushNotifications.addListener("registrationError", () => {
        /* scaffold — do not toast or retry-spam */
      });
      await PushNotifications.addListener("pushNotificationReceived", () => {
        /* no foreground UI until a live sender exists */
      });
      await PushNotifications.addListener("pushNotificationActionPerformed", () => {
        /* deep-link vacancy / inbox later */
      });
    }

    await PushNotifications.register();
    return { ok: true, platform };
  } catch {
    return { ok: false, reason: "no-plugin", error: PUSH_SCAFFOLD_MESSAGE };
  }
}

/** Test-only: allow re-binding listeners in unit checks. */
export function resetPushClientForTests(): void {
  sessionStarted = false;
}
