/**
 * Hard-delete scheduling. The daily cron and the signed-in expiry path both
 * use this. No database and no third-party calls live here.
 */
import { ACCOUNT_RESTORE_MS } from "./account-delete.ts";

/** Not a real user id. Invoices and payments keep this instead of the person. */
export const DELETED_ACCOUNT_TOMBSTONE = "deleted-account";

export function accountPurgeCutoffMs(nowMs: number, restoreMs = ACCOUNT_RESTORE_MS): number {
  return nowMs - restoreMs;
}

/** True once the 30-day restore window has ended. A missing date is not due. */
export function accountIsDueForPurge(
  deletedAt: string | Date | null | undefined,
  nowMs: number,
  restoreMs = ACCOUNT_RESTORE_MS,
): boolean {
  if (!deletedAt) return false;
  const start = deletedAt instanceof Date ? deletedAt.getTime() : new Date(deletedAt).getTime();
  if (!Number.isFinite(start)) return false;
  return nowMs - start >= restoreMs;
}

/** Count only. Never include an email, user id, or third-party id. */
export function accountPurgeLog(purged: number): string {
  const n = Number.isFinite(purged) && purged > 0 ? Math.floor(purged) : 0;
  return `[account-purge] purged=${n}`;
}

/**
 * Wipe every id the lister returns. One failure does not stop the rest.
 * `purgeUser` returns true only when that account was actually removed.
 */
export async function purgeDueAccounts(input: {
  nowMs: number;
  restoreMs?: number;
  listUserIds: (cutoffIso: string) => Promise<string[]>;
  purgeUser: (userId: string) => Promise<boolean>;
}): Promise<{ purged: number; log: string }> {
  const restoreMs = input.restoreMs ?? ACCOUNT_RESTORE_MS;
  const cutoffIso = new Date(accountPurgeCutoffMs(input.nowMs, restoreMs)).toISOString();
  const ids = await input.listUserIds(cutoffIso);
  const unique = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
  let purged = 0;
  for (const id of unique) {
    try {
      if (await input.purgeUser(id)) purged += 1;
    } catch {
      /* The next daily run retries this account. */
    }
  }
  return { purged, log: accountPurgeLog(purged) };
}
