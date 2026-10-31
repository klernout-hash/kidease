import { getSql, type Sql } from "@/lib/db";
import { newReferralCode, normalizeReferralCode, referralDecision } from "@/lib/referrals";

export type ReferralSummary = { code: string; opens: number; joins: number };

async function countJoins(sql: Sql, userId: string): Promise<number> {
  const rows = await sql<{ n: number | string }>`
    select count(*)::int as n from referral_joins where referrer_user_id = ${userId}
  `;
  return Number(rows[0]?.n ?? 0);
}

export async function ensureReferralCode(userId: string): Promise<ReferralSummary> {
  const sql = await getSql();
  const existing = await sql<{ code: string; opens: number | string }>`
    select code, opens from referral_codes where user_id = ${userId} limit 1
  `;
  let code = existing[0]?.code ?? "";
  let opens = Number(existing[0]?.opens ?? 0);
  if (!code) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const next = newReferralCode();
      try {
        await sql`insert into referral_codes (user_id, code) values (${userId}, ${next})`;
        code = next;
        opens = 0;
        break;
      } catch {
        /* unique code collision — try another */
      }
    }
  }
  if (!code) throw new Error("Could not create a share link");
  return { code, opens, joins: await countJoins(sql, userId) };
}

export async function recordReferralOpen(raw: string): Promise<boolean> {
  const code = normalizeReferralCode(raw);
  if (!code) return false;
  const sql = await getSql();
  const rows = await sql<{ code: string }>`
    update referral_codes set opens = opens + 1 where code = ${code} returning code
  `;
  return rows.length > 0;
}

export async function claimReferral(userId: string, raw: string): Promise<{ ok: true; joined: boolean } | { ok: false }> {
  const code = normalizeReferralCode(raw);
  if (!code) return { ok: false };
  const sql = await getSql();
  const owners = await sql<{ user_id: string }>`
    select user_id from referral_codes where code = ${code} limit 1
  `;
  const prior = await sql<{ referred_user_id: string }>`
    select referred_user_id from referral_joins where referred_user_id = ${userId} limit 1
  `;
  const decision = referralDecision({
    codeOwnerId: owners[0]?.user_id ?? null,
    referredUserId: userId,
    alreadyJoined: prior.length > 0,
  });
  if (decision !== "ok" || !owners[0]) return { ok: true, joined: false };
  try {
    await sql`
      insert into referral_joins (referred_user_id, code, referrer_user_id)
      values (${userId}, ${code}, ${owners[0].user_id})
    `;
  } catch {
    return { ok: true, joined: false };
  }
  const { noteThankYou } = await import("@/lib/server/growth-loops");
  await noteThankYou(owners[0].user_id, userId).catch(() => undefined);
  return { ok: true, joined: true };
}

export async function purgeReferralRows(sql: Sql, userId: string) {
  await sql`delete from referral_rewards where referrer_user_id = ${userId} or referred_user_id = ${userId}`.catch(() => undefined);
  await sql`delete from family_invites where user_id = ${userId}`.catch(() => undefined);
  await sql`delete from referral_joins where referred_user_id = ${userId} or referrer_user_id = ${userId}`.catch(() => undefined);
  await sql`delete from referral_codes where user_id = ${userId}`.catch(() => undefined);
}
