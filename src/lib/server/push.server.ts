import { pushEnabled, pushLive, PUSH_SCAFFOLD_MESSAGE } from "@/lib/push";

export type PushSendResult = { ok: false; error: string; skipped: true };

/**
 * Server send stub. Does not call FCM or APNs.
 * Wire a real provider only after Kyle opens Google / Apple accounts.
 */
export async function sendPushNotification(_input: {
  userId: string;
  title: string;
  body: string;
}): Promise<PushSendResult> {
  void _input;
  if (!pushEnabled() || !pushLive()) {
    return { ok: false, skipped: true, error: PUSH_SCAFFOLD_MESSAGE };
  }
  return { ok: false, skipped: true, error: PUSH_SCAFFOLD_MESSAGE };
}
