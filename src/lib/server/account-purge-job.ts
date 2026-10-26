/**
 * Daily hard wipe. Lists profiles whose deletion request is older than 30 days
 * and removes them even if that person never signs in again.
 */
import { purgeDueAccounts } from "@/lib/account-purge";

export async function runAccountPurgeJob(nowMs = Date.now()) {
  const { getSql } = await import("@/lib/db");
  const { purgeAccountData } = await import("@/lib/server/family");
  const sql = await getSql();
  return purgeDueAccounts({
    nowMs,
    listUserIds: async (cutoffIso) => {
      const rows = await sql<{ user_id: string }>`
        select user_id from profiles
        where deleted_at is not null
          and deleted_at <= ${cutoffIso}::timestamptz
      `;
      return rows.map((row) => row.user_id);
    },
    purgeUser: (userId) => purgeAccountData(userId),
  });
}
