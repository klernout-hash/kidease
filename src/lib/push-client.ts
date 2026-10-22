import { PUSH_DISABLED_MESSAGE, PUSH_SCAFFOLD_MESSAGE, PUSH_WEB_BLOCKED_MESSAGE } from "@/lib/push";
import { isNative, nativePlatform } from "@/lib/native";
import { googleServicesHidden, readClientStoreChannel } from "@/lib/native-entitlements";

export type PushRegisterResult =
  | { ok: true; platform: "ios" | "android" }
  | { ok: false; reason: "disabled" | "no-plugin" | "denied" | "register-failed"; error: string };

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

  // v1 store binaries do not include the push plugin or Firebase Messaging.
  return { ok: false, reason: "no-plugin", error: PUSH_SCAFFOLD_MESSAGE };
}
