import {
  PUSH_CREDENTIALS_MESSAGE,
  PUSH_DRY_RUN_MESSAGE,
  PUSH_SCAFFOLD_MESSAGE,
  pushCredentialsPresent,
  pushEnabled,
} from "@/lib/push";
import { previewPushAllowed, previewSendsArmed } from "@/lib/qa-send";

export type PushSendResult =
  | {
      ok: true;
      sent: number;
      failed: number;
      skipped: number;
      tokenCount: number;
    }
  | {
      ok: false;
      error: string;
      skipped: true;
      dryRun?: true;
      tokenCount?: number;
    };

/**
 * Server send helper. No-ops when FEATURE_PUSH is off.
 * When the flag is on but FCM / APNs env is missing, dry-runs token counts.
 * When the flag and credentials are present, sends via FCM HTTP v1 / APNs.
 */
export async function sendPushNotification(input: {
  userId: string;
  title: string;
  body: string;
  url?: string;
}): Promise<PushSendResult> {
  if (!pushEnabled()) {
    return { ok: false, skipped: true, error: PUSH_SCAFFOLD_MESSAGE };
  }
  try {
    if (previewSendsArmed(process.env)) {
      const { getSql } = await import("@/lib/db");
      const sql = await getSql();
      const rows = await sql<{ email: string | null }>`
        select email from "user" where id = ${input.userId} limit 1
      `.catch(() => [] as { email: string | null }[]);
      if (!previewPushAllowed(rows[0]?.email || "", process.env)) {
        console.info("[kidease-qa-send]", JSON.stringify({ channel: "push", reason: "preview_blocked" }));
        return { ok: false, skipped: true, error: "QA preview: this account is not on QA_PUSH_ALLOWLIST." };
      }
    }
    const { getSql } = await import("@/lib/db");
    const { listPushDeviceTokens, dryRunPushNotification } = await import("./push-tokens");
    const sql = await getSql();
    if (!pushCredentialsPresent()) {
      const result = await dryRunPushNotification(input, { sql });
      return {
        ok: false,
        skipped: true,
        dryRun: true,
        tokenCount: result.tokenCount,
        error: result.error || PUSH_CREDENTIALS_MESSAGE,
      };
    }
    const { sendPushToDevices } = await import("./push-send");
    const tokens = await listPushDeviceTokens(sql, input.userId);
    const result = await sendPushToDevices(
      { title: input.title, body: input.body, url: input.url, tokens },
      { sql },
    );
    if (!result.ok) {
      return { ok: false, skipped: true, error: result.error, tokenCount: result.tokenCount };
    }
    return {
      ok: true,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
      tokenCount: result.tokenCount,
    };
  } catch {
    return { ok: false, skipped: true, dryRun: true, tokenCount: 0, error: PUSH_DRY_RUN_MESSAGE };
  }
}
