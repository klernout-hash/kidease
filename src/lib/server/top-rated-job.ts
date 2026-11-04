import { topRatedEnabled } from "@/lib/features";

/** Monthly recheck. Does nothing, and does not touch the database, while the flag is off. */
export async function runTopRatedSweep(
  env: Record<string, string | undefined> = process.env,
): Promise<{ skipped: boolean; reason: string; checked: number }> {
  if (!topRatedEnabled(env)) return { skipped: true, reason: "flag", checked: 0 };
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ id: string }>`select id from daycares limit 50`;
    return { skipped: false, reason: "checked", checked: rows.length };
  } catch {
    return { skipped: true, reason: "read", checked: 0 };
  }
}
