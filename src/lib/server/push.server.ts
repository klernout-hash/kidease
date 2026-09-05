import { pushEnabled, PUSH_SCAFFOLD_MESSAGE, PUSH_DRY_RUN_MESSAGE } from "@/lib/push";

export type PushSendResult = {
  ok: false;
  error: string;
  skipped: true;
  dryRun?: true;
  tokenCount?: number;
};

/**
 * Server send stub. Does not call FCM or APNs.
 * When FEATURE_PUSH is on it dry-runs against stored tokens only.
 * Wire a real provider only after Kyle opens Google / Apple accounts.
 */
export async function sendPushNotification(input: {
  userId: string;
  title: string;
  body: string;
}): Promise<PushSendResult> {
  if (!pushEnabled()) {
    return { ok: false, skipped: true, error: PUSH_SCAFFOLD_MESSAGE };
  }
  try {
    const { getSql } = await import("@/lib/db");
    const { dryRunPushNotification } = await import("./push-tokens");
    const sql = await getSql();
    const result = await dryRunPushNotification(input, { sql });
    return {
      ok: false,
      skipped: true,
      dryRun: true,
      tokenCount: result.tokenCount,
      error: result.error || PUSH_DRY_RUN_MESSAGE,
    };
  } catch {
    return { ok: false, skipped: true, dryRun: true, tokenCount: 0, error: PUSH_DRY_RUN_MESSAGE };
  }
}
