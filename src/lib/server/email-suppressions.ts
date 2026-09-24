import { getSql } from "@/lib/db";
import {
  applyResendEmailEvent,
  clampHealthDays,
  emailHealthStats,
  isSuppressedEmail,
  listSuppressedEmails,
  type SuppressionReason,
} from "@/lib/email-suppressions";
import { suppressGhlEmail } from "@/lib/ghl-api";

/** Pre-send check. DB errors fail open (return false) so a lookup blip does not halt mail. */
export async function isSuppressed(email: string | null | undefined): Promise<boolean> {
  try {
    const sql = await getSql();
    return await isSuppressedEmail(email, sql);
  } catch (err) {
    console.error("[kidease-mail] suppression lookup failed", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function listEmailSuppressions(): Promise<string[]> {
  const sql = await getSql();
  return listSuppressedEmails(sql);
}

export async function loadEmailHealth(days: unknown) {
  const sql = await getSql();
  return emailHealthStats(sql, clampHealthDays(days));
}

async function pushSuppressionToGhl(item: { email: string; reason: SuppressionReason }) {
  try {
    const result = await suppressGhlEmail({ email: item.email, reason: item.reason });
    if (!result.ok) console.error("[kidease-ghl] suppression", result.error);
    else if (result.skipped) console.info("[kidease-ghl] suppression skipped", result.reason);
  } catch (err) {
    console.error("[kidease-ghl] suppression push failed", err instanceof Error ? err.message : err);
  }
}

export async function applyIncomingResendEvent(input: { event: unknown; svixId: string }) {
  const sql = await getSql();
  return applyResendEmailEvent({
    event: input.event,
    svixId: input.svixId,
    sql,
    pushGhl: pushSuppressionToGhl,
  });
}
