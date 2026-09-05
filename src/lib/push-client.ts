import { PUSH_SCAFFOLD_MESSAGE } from "@/lib/push";

export type PushRegisterResult = { ok: false; reason: "disabled" | "no-plugin"; error: string };

/**
 * Client registration stub. No Firebase SDK, no Capacitor PushNotifications.
 * Safe to call from native boot later — always no-ops today.
 */
export async function registerPushDevice(): Promise<PushRegisterResult> {
  return { ok: false, reason: "no-plugin", error: PUSH_SCAFFOLD_MESSAGE };
}
