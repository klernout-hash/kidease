import { getSql } from "@/lib/db";
import { readSessionToken } from "@/lib/auth/server";
import { ADMIN_IDLE_TTL_MS } from "@/lib/reauth";

export const ADMIN_IDLE_MESSAGE = "Admin session timed out. Sign in again.";

export async function assertAdminIdleFresh(userId: string) {
  const { isAdminIdleFresh, writeAdminIdleCookie } = await import("./reauth.server");
  if (isAdminIdleFresh()) {
    writeAdminIdleCookie();
    return;
  }
  const token = readSessionToken();
  if (!token) throw new Error(ADMIN_IDLE_MESSAGE);
  const sql = await getSql();
  const rows = await sql<{ createdAt: string }>`
    select "createdAt" from "session" where token = ${token} and "userId" = ${userId} limit 1
  `.catch(() => []);
  const created = rows[0]?.createdAt ? new Date(rows[0].createdAt).getTime() : 0;
  if (created && Date.now() - created < ADMIN_IDLE_TTL_MS) {
    writeAdminIdleCookie();
    return;
  }
  throw new Error(ADMIN_IDLE_MESSAGE);
}
